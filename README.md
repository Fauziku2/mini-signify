# mini-signify

A small learning project to mimic a simplified document platform architecture using React, NestJS, TypeORM, PostgreSQL, S3, Docker, and later ECS/Pulumi.

## Local architecture

- React + Chakra UI frontend
- NestJS backend
- PostgreSQL for metadata
- S3 for file storage

## Docker networking note

When running the backend in Docker locally on Mac:

- `DB_HOST=host.docker.internal`

This is because the backend container needs to reach services outside the container, such as Postgres exposed through the host.

For the frontend Vite app:

- `VITE_API_BASE_URL=http://localhost:3000`

This is because the React app runs in the browser after the static files are served, so API calls are made from the browser, not from inside the frontend container.

### Summary

- container -> host service: `host.docker.internal`
- browser -> host service: `localhost`