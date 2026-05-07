import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

// GitHub repo allowed to assume the AWS role
const githubOwner = "Fauziku2";
const githubRepoName = "mini-signify";
const githubRepo = `${githubOwner}/${githubRepoName}`;

// ECR repo for backend Docker images
const backendRepository = new aws.ecr.Repository("miniSignifyBackendRepo", {
  name: "mini-signify-backend",
  imageScanningConfiguration: {
    scanOnPush: true,
  },
  imageTagMutability: "MUTABLE",
});

// S3 bucket for frontend static files
const frontendBucket = new aws.s3.Bucket("miniSignifyFrontendBucket", {
  bucket: "mini-signify-frontend-877269913405-ap-southeast-1",
});

// Block direct public access to the frontend bucket
const frontendBucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock(
  "miniSignifyFrontendBucketPublicAccessBlock",
  {
    bucket: frontendBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  },
);

// CloudFront OAC allows CloudFront to access private S3
const frontendOriginAccessControl = new aws.cloudfront.OriginAccessControl(
  "miniSignifyFrontendOac",
  {
    name: "mini-signify-frontend-oac",
    description: "OAC for mini-signify frontend S3 bucket",
    originAccessControlOriginType: "s3",
    signingBehavior: "always",
    signingProtocol: "sigv4",
  },
);

// CloudFront distribution for frontend app
const frontendDistribution = new aws.cloudfront.Distribution(
  "miniSignifyFrontendDistribution",
  {
    enabled: true,
    defaultRootObject: "index.html",

    origins: [
      {
        originId: "mini-signify-frontend-s3-origin",
        domainName: frontendBucket.bucketRegionalDomainName,
        originAccessControlId: frontendOriginAccessControl.id,
        s3OriginConfig: {
          originAccessIdentity: "",
        },
      },
    ],

    defaultCacheBehavior: {
      targetOriginId: "mini-signify-frontend-s3-origin",
      viewerProtocolPolicy: "redirect-to-https",

      allowedMethods: ["GET", "HEAD", "OPTIONS"],
      cachedMethods: ["GET", "HEAD"],

      forwardedValues: {
        queryString: false,
        cookies: {
          forward: "none",
        },
      },
    },

    // Helps React Router / SPA routes work after refresh
    customErrorResponses: [
      {
        errorCode: 403,
        responseCode: 200,
        responsePagePath: "/index.html",
      },
      {
        errorCode: 404,
        responseCode: 200,
        responsePagePath: "/index.html",
      },
    ],

    restrictions: {
      geoRestriction: {
        restrictionType: "none",
      },
    },

    viewerCertificate: {
      cloudfrontDefaultCertificate: true,
    },
  },
);

// Allow CloudFront distribution to read files from private S3 bucket
const frontendBucketPolicy = new aws.s3.BucketPolicy(
  "miniSignifyFrontendBucketPolicy",
  {
    bucket: frontendBucket.id,
    policy: pulumi
      .all([frontendBucket.arn, frontendDistribution.arn])
      .apply(([bucketArn, distributionArn]) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "AllowCloudFrontReadAccess",
              Effect: "Allow",
              Principal: {
                Service: "cloudfront.amazonaws.com",
              },
              Action: "s3:GetObject",
              Resource: `${bucketArn}/*`,
              Condition: {
                StringEquals: {
                  "AWS:SourceArn": distributionArn,
                },
              },
            },
          ],
        }),
      ),
  },
);

// Allow AWS to trust GitHub Actions OIDC tokens
const githubOidcProvider = new aws.iam.OpenIdConnectProvider(
  "githubOidcProvider",
  {
    url: "https://token.actions.githubusercontent.com",
    clientIdLists: ["sts.amazonaws.com"],
    thumbprintLists: ["6938fd4d98bab03faadb97b34396831e3780aea1"],
  },
);

// IAM role that GitHub Actions can assume
const githubActionsRole = new aws.iam.Role("githubActionsRole", {
  name: "mini-signify-github-actions-role",
  assumeRolePolicy: pulumi.all([githubOidcProvider.arn]).apply(([providerArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Federated: providerArn,
          },
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringEquals: {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            },
            StringLike: {
              "token.actions.githubusercontent.com:sub": `repo:${githubRepo}:*`,
            },
          },
        },
      ],
    }),
  ),
});

// IAM policy for GitHub Actions deployment permissions
const githubActionsPolicy = new aws.iam.Policy("githubActionsPolicy", {
  name: "mini-signify-github-actions-policy",
  policy: pulumi
    .all([backendRepository.arn, frontendBucket.arn, frontendDistribution.arn])
    .apply(([backendRepoArn, frontendBucketArn, frontendDistributionArn]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AllowEcrAuthToken",
            Effect: "Allow",
            Action: ["ecr:GetAuthorizationToken"],
            Resource: "*",
          },
          {
            Sid: "AllowBackendEcrPushPull",
            Effect: "Allow",
            Action: [
              "ecr:BatchCheckLayerAvailability",
              "ecr:BatchGetImage",
              "ecr:CompleteLayerUpload",
              "ecr:DescribeImages",
              "ecr:DescribeRepositories",
              "ecr:GetDownloadUrlForLayer",
              "ecr:InitiateLayerUpload",
              "ecr:ListImages",
              "ecr:PutImage",
              "ecr:UploadLayerPart",
            ],
            Resource: backendRepoArn,
          },
          {
            Sid: "AllowFrontendBucketList",
            Effect: "Allow",
            Action: ["s3:ListBucket"],
            Resource: frontendBucketArn,
          },
          {
            Sid: "AllowFrontendAssetsUploadDelete",
            Effect: "Allow",
            Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
            Resource: `${frontendBucketArn}/*`,
          },
          {
            // Allow GitHub Actions to clear CloudFront cache after frontend deploy
            Sid: "AllowFrontendCloudFrontInvalidation",
            Effect: "Allow",
            Action: [
              "cloudfront:CreateInvalidation",
              "cloudfront:GetInvalidation",
              "cloudfront:ListInvalidations",
            ],
            Resource: frontendDistributionArn,
        },
        ],
      }),
    ),
});

// Attach the deployment policy to the GitHub Actions role
const githubActionsPolicyAttachment = new aws.iam.RolePolicyAttachment(
  "githubActionsPolicyAttachment",
  {
    role: githubActionsRole.name,
    policyArn: githubActionsPolicy.arn,
  },
);

// Useful Pulumi outputs
export const backendRepositoryUrl = backendRepository.repositoryUrl;
export const frontendBucketName = frontendBucket.bucket;
export const frontendBucketPublicAccessBlockId = frontendBucketPublicAccessBlock.id;
export const frontendDistributionDomainName = frontendDistribution.domainName;
export const frontendDistributionId = frontendDistribution.id;
export const githubOidcProviderArn = githubOidcProvider.arn;
export const githubActionsRoleArn = githubActionsRole.arn;
export const githubActionsPolicyArn = githubActionsPolicy.arn;
export const githubActionsPolicyAttachmentId = githubActionsPolicyAttachment.id;