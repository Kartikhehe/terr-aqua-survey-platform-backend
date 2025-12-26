# API Documentation with Swagger

This project uses Swagger/OpenAPI for interactive API documentation.

## Accessing the API Documentation

### Local Development
When running the server locally, access the Swagger UI at:
```
http://localhost:3001/api-docs
```

### Production
Access the production API documentation at:
```
https://terr-aqua-survey-platform-backend.vercel.app/api-docs
```

## Features

The Swagger UI provides:
- **Interactive API Testing**: Test all endpoints directly from the browser
- **Request/Response Examples**: See example requests and responses for each endpoint
- **Authentication**: Test authenticated endpoints using JWT tokens
- **Schema Documentation**: View all data models and their properties

## API Endpoints Documented

### Authentication (`/auth`)
- `POST /auth/signup` - Register a new user
- `POST /auth/verify-otp` - Verify email with OTP
- `POST /auth/resend-otp` - Resend OTP
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user
- `POST /auth/logout` - User logout

### Projects (`/api/projects`)
- `GET /api/projects` - Get all projects
- `GET /api/projects/active` - Get active project
- `POST /api/projects` - Create new project
- `GET /api/projects/:id` - Get single project
- `PUT /api/projects/:id/status` - Update project status
- `POST /api/projects/:id/heartbeat` - Send project heartbeat
- `DELETE /api/projects/:id` - Delete project

### Waypoints (`/api/waypoints`)
- Coming soon...

### Tracks (`/api/tracks`)
- Coming soon...

### Upload (`/api/upload`)
- Coming soon...

## Authentication in Swagger

To test authenticated endpoints:

1. First, login using the `/auth/login` endpoint
2. Copy the JWT token from the response
3. Click the "Authorize" button at the top of the Swagger UI
4. Enter the token in the format: `Bearer <your-token>`
5. Click "Authorize"
6. Now you can test all authenticated endpoints

Alternatively, if you're already logged in via the web app, the cookie-based authentication will work automatically.

## OpenAPI Specification

You can also access the raw OpenAPI specification in JSON format:
```
http://localhost:3001/api-docs.json
```

This can be imported into other API tools like Postman, Insomnia, or used for code generation.

## Updating Documentation

The API documentation is generated from JSDoc comments in the route files. To update:

1. Edit the `@swagger` comments in the route files (`routes/*.js`)
2. Update schemas in `config/swagger.js` if needed
3. Restart the server to see changes

## Configuration

Swagger configuration is located in:
```
server/config/swagger.js
```

This file contains:
- API metadata (title, version, description)
- Server URLs
- Security schemes
- Reusable schemas
- Tags for grouping endpoints
