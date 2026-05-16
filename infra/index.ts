import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

// GitHub repo allowed to assume the AWS role
const githubOwner = "Fauziku2";
const githubRepoName = "mini-signify";
const githubRepo = `${githubOwner}/${githubRepoName}`;

const config = new pulumi.Config();
const dbPassword = config.requireSecret("dbPassword");

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

// ECS cluster for backend service
const backendCluster = new aws.ecs.Cluster("miniSignifyBackendCluster", {
  name: "mini-signify-backend-cluster",
});

// CloudWatch log group for backend container logs
const backendLogGroup = new aws.cloudwatch.LogGroup("miniSignifyBackendLogGroup", {
  name: "/ecs/mini-signify-backend",
  retentionInDays: 7,
});

// IAM role used by ECS to pull image from ECR and write logs
const backendTaskExecutionRole = new aws.iam.Role(
  "miniSignifyBackendTaskExecutionRole",
  {
    name: "mini-signify-backend-task-execution-role",
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Service: "ecs-tasks.amazonaws.com",
          },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  },
);

// Attach AWS managed policy so ECS can pull image from ECR and write logs
const backendTaskExecutionRolePolicyAttachment =
  new aws.iam.RolePolicyAttachment(
    "miniSignifyBackendTaskExecutionRolePolicyAttachment",
    {
      role: backendTaskExecutionRole.name,
      policyArn:
        "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
    },
  );

  // Existing S3 bucket where uploaded PDFs are stored.
const documentsBucketName = "mini-signify-documents-dev-877269913405-ap-southeast-1-an";

// IAM role used by the backend ECS task to access AWS services like S3.
const backendTaskRole = new aws.iam.Role("miniSignifyBackendTaskRole", {
  name: "mini-signify-backend-task-role",

  // Allow ECS tasks to assume this role.
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "ecs-tasks.amazonaws.com",
  }),
});

// Allow backend ECS task to access the documents S3 bucket.
const backendTaskS3Policy = new aws.iam.Policy("miniSignifyBackendTaskS3Policy", {
  name: "mini-signify-backend-task-s3-policy",

  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AllowListDocumentsBucket",
        Effect: "Allow",
        Action: ["s3:ListBucket"],
        Resource: `arn:aws:s3:::${documentsBucketName}`,
      },
      {
        Sid: "AllowReadWriteDeleteDocuments",
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        Resource: `arn:aws:s3:::${documentsBucketName}/*`,
      },
    ],
  }),
});

// Attach S3 access policy to the backend ECS task role.
const backendTaskS3PolicyAttachment = new aws.iam.RolePolicyAttachment(
  "miniSignifyBackendTaskS3PolicyAttachment",
  {
    role: backendTaskRole.name,
    policyArn: backendTaskS3Policy.arn,
  },
);

// VPC for backend ECS/ALB networking
const backendVpc = new aws.ec2.Vpc("miniSignifyBackendVpc", {
  cidrBlock: "10.0.0.0/16",
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    Name: "mini-signify-backend-vpc",
  },
});

// Internet Gateway for public internet access
const backendInternetGateway = new aws.ec2.InternetGateway(
  "miniSignifyBackendInternetGateway",
  {
    vpcId: backendVpc.id,
    tags: {
      Name: "mini-signify-backend-igw",
    },
  },
);

// Public subnet in AZ 1
const backendPublicSubnetA = new aws.ec2.Subnet("miniSignifyBackendPublicSubnetA", {
  vpcId: backendVpc.id,
  cidrBlock: "10.0.1.0/24",
  availabilityZone: "ap-southeast-1a",
  mapPublicIpOnLaunch: true,
  tags: {
    Name: "mini-signify-backend-public-subnet-a",
  },
});

// Public subnet in AZ 2
const backendPublicSubnetB = new aws.ec2.Subnet("miniSignifyBackendPublicSubnetB", {
  vpcId: backendVpc.id,
  cidrBlock: "10.0.2.0/24",
  availabilityZone: "ap-southeast-1b",
  mapPublicIpOnLaunch: true,
  tags: {
    Name: "mini-signify-backend-public-subnet-b",
  },
});

// Private subnet in AZ 1 for RDS
const backendPrivateSubnetA = new aws.ec2.Subnet("miniSignifyBackendPrivateSubnetA", {
  vpcId: backendVpc.id,
  cidrBlock: "10.0.11.0/24",
  availabilityZone: "ap-southeast-1a",
  mapPublicIpOnLaunch: false,
  tags: {
    Name: "mini-signify-backend-private-subnet-a",
  },
});

// Private subnet in AZ 2 for RDS
const backendPrivateSubnetB = new aws.ec2.Subnet("miniSignifyBackendPrivateSubnetB", {
  vpcId: backendVpc.id,
  cidrBlock: "10.0.12.0/24",
  availabilityZone: "ap-southeast-1b",
  mapPublicIpOnLaunch: false,
  tags: {
    Name: "mini-signify-backend-private-subnet-b",
  },
});


// Route table for public subnets
const backendPublicRouteTable = new aws.ec2.RouteTable(
  "miniSignifyBackendPublicRouteTable",
  {
    vpcId: backendVpc.id,
    routes: [
      {
        cidrBlock: "0.0.0.0/0",
        gatewayId: backendInternetGateway.id,
      },
    ],
    tags: {
      Name: "mini-signify-backend-public-rt",
    },
  },
);

// Associate route table with subnet A
new aws.ec2.RouteTableAssociation("miniSignifyBackendPublicSubnetAAssociation", {
  subnetId: backendPublicSubnetA.id,
  routeTableId: backendPublicRouteTable.id,
});

// Associate route table with subnet B
new aws.ec2.RouteTableAssociation("miniSignifyBackendPublicSubnetBAssociation", {
  subnetId: backendPublicSubnetB.id,
  routeTableId: backendPublicRouteTable.id,
});

// Security group for public ALB
const backendAlbSecurityGroup = new aws.ec2.SecurityGroup(
  "miniSignifyBackendAlbSecurityGroup",
  {
    name: "mini-signify-backend-alb-sg",
    description: "Allow public HTTP/HTTPS traffic to backend ALB",
    vpcId: backendVpc.id,
    ingress: [
      {
        protocol: "tcp",
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ["0.0.0.0/0"],
      },
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: "mini-signify-backend-alb-sg",
    },
  },
);

// Security group for backend ECS tasks
const backendTaskSecurityGroup = new aws.ec2.SecurityGroup(
  "miniSignifyBackendTaskSecurityGroup",
  {
    name: "mini-signify-backend-task-sg",
    description: "Allow backend traffic only from ALB",
    vpcId: backendVpc.id,
    ingress: [
      {
        protocol: "tcp",
        fromPort: 3000,
        toPort: 3000,
        securityGroups: [backendAlbSecurityGroup.id],
      },
    ],
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: "mini-signify-backend-task-sg",
    },
  },
);

// Public Application Load Balancer for backend API
const backendLoadBalancer = new aws.lb.LoadBalancer("miniSignifyBackendAlb", {
  name: "mini-signify-backend-alb",
  loadBalancerType: "application",
  internal: false,
  securityGroups: [backendAlbSecurityGroup.id],
  subnets: [backendPublicSubnetA.id, backendPublicSubnetB.id],
  tags: {
    Name: "mini-signify-backend-alb",
  },
});

// Target group for backend ECS tasks
const backendTargetGroup = new aws.lb.TargetGroup("miniSignifyBackendTargetGroup", {
  name: "mini-signify-backend-tg",
  port: 3000,
  protocol: "HTTP",
  targetType: "ip",
  vpcId: backendVpc.id,

  healthCheck: {
    enabled: true,
    path: "/health",
    protocol: "HTTP",
    matcher: "200",
  },

  tags: {
    Name: "mini-signify-backend-tg",
  },
});

// HTTP listener for backend ALB
const backendHttpListener = new aws.lb.Listener("miniSignifyBackendHttpListener", {
  loadBalancerArn: backendLoadBalancer.arn,
  port: 80,
  protocol: "HTTP",

  defaultActions: [
    {
      type: "forward",
      targetGroupArn: backendTargetGroup.arn,
    },
  ],
});

// Security group for RDS PostgreSQL
const backendDbSecurityGroup = new aws.ec2.SecurityGroup(
  "miniSignifyBackendDbSecurityGroup",
  {
    name: "mini-signify-backend-db-sg",
    description: "Allow PostgreSQL traffic only from backend ECS tasks",
    vpcId: backendVpc.id,
    ingress: [
      {
        protocol: "tcp",
        fromPort: 5432,
        toPort: 5432,
        securityGroups: [backendTaskSecurityGroup.id],
      },
    ],
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: "mini-signify-backend-db-sg",
    },
  },
);

// DB subnet group tells RDS which private subnets to use
const backendDbSubnetGroup = new aws.rds.SubnetGroup(
  "miniSignifyBackendDbSubnetGroup",
  {
    name: "mini-signify-backend-db-subnet-group",
    subnetIds: [backendPrivateSubnetA.id, backendPrivateSubnetB.id],
    tags: {
      Name: "mini-signify-backend-db-subnet-group",
    },
  },
);

// PostgreSQL RDS database for backend metadata
const backendDbInstance = new aws.rds.Instance("miniSignifyBackendDb", {
  identifier: "mini-signify-backend-db",
  engine: "postgres",
  engineVersion: "16",
  instanceClass: "db.t4g.micro",

  allocatedStorage: 20,
  storageType: "gp3",

  dbName: "mini_signify",
  username: "postgres",
  password: dbPassword,

  dbSubnetGroupName: backendDbSubnetGroup.name,
  vpcSecurityGroupIds: [backendDbSecurityGroup.id],

  publiclyAccessible: false,
  skipFinalSnapshot: true,
  deletionProtection: false,

  tags: {
    Name: "mini-signify-backend-db",
  },
});

// Backend Docker image tag used by ECS task definition.
const backendImageTag = config.get("backendImageTag") ?? "latest";

// Backend Docker image URI from ECR.
const backendImage = pulumi.interpolate`${backendRepository.repositoryUrl}:${backendImageTag}`;

// ECS task definition for running the NestJS backend container.
const backendTaskDefinition = new aws.ecs.TaskDefinition(
  "miniSignifyBackendTaskDefinition",
  {
    family: "mini-signify-backend",
    requiresCompatibilities: ["FARGATE"],
    networkMode: "awsvpc",
    cpu: "256",
    memory: "512",

    executionRoleArn: backendTaskExecutionRole.arn,
    taskRoleArn: backendTaskRole.arn,

    containerDefinitions: pulumi
      .all([
        backendImage,
        backendDbInstance.address,
        backendDbInstance.port,
        backendDbInstance.dbName,
        dbPassword,
        backendLogGroup.name,
      ])
      .apply(
        ([
          image,
          dbHost,
          dbPort,
          dbName,
          dbPasswordValue,
          logGroupName,
        ]) =>
          JSON.stringify([
            {
              name: "mini-signify-backend",
              image,
              essential: true,

              portMappings: [
                {
                  containerPort: 3000,
                  hostPort: 3000,
                  protocol: "tcp",
                },
              ],

              environment: [
                {
                  name: "PORT",
                  value: "3000",
                },
                {
                  name: "DB_HOST",
                  value: dbHost,
                },
                {
                  name: "DB_PORT",
                  value: String(dbPort),
                },
                {
                  name: "DB_USERNAME",
                  value: "postgres",
                },
                {
                  name: "DB_PASSWORD",
                  value: dbPasswordValue,
                },
                {
                  name: "DB_NAME",
                  value: dbName,
                },
                {
                  name: "AWS_REGION",
                  value: "ap-southeast-1",
                },
                {
                  name: "AWS_S3_BUCKET_NAME",
                  value: documentsBucketName,
                },
              ],

              logConfiguration: {
                logDriver: "awslogs",
                options: {
                  "awslogs-group": logGroupName,
                  "awslogs-region": "ap-southeast-1",
                  "awslogs-stream-prefix": "backend",
                },
              },
            },
          ]),
      ),
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
export const backendClusterName = backendCluster.name;
export const backendLogGroupName = backendLogGroup.name;
export const backendTaskExecutionRoleArn = backendTaskExecutionRole.arn;
export const backendTaskExecutionRolePolicyAttachmentId = backendTaskExecutionRolePolicyAttachment.id;
export const backendTaskRoleArn = backendTaskRole.arn;
export const backendTaskS3PolicyArn = backendTaskS3Policy.arn;
export const backendTaskS3PolicyAttachmentId = backendTaskS3PolicyAttachment.id;
export const backendVpcId = backendVpc.id;
export const backendPublicSubnetAId = backendPublicSubnetA.id;
export const backendPublicSubnetBId = backendPublicSubnetB.id;
export const backendAlbSecurityGroupId = backendAlbSecurityGroup.id;
export const backendTaskSecurityGroupId = backendTaskSecurityGroup.id;
export const backendLoadBalancerDnsName = backendLoadBalancer.dnsName;
export const backendLoadBalancerArn = backendLoadBalancer.arn;
export const backendTargetGroupArn = backendTargetGroup.arn;
export const backendHttpListenerArn = backendHttpListener.arn;
export const backendPrivateSubnetAId = backendPrivateSubnetA.id;
export const backendPrivateSubnetBId = backendPrivateSubnetB.id;
export const backendDbSecurityGroupId = backendDbSecurityGroup.id;
export const backendDbSubnetGroupName = backendDbSubnetGroup.name;
export const backendDbEndpoint = backendDbInstance.address;
export const backendDbPort = backendDbInstance.port;
export const backendDbName = backendDbInstance.dbName;
export const backendTaskDefinitionArn = backendTaskDefinition.arn;