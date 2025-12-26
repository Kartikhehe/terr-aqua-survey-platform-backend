import swaggerJsdoc from 'swagger-jsdoc';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'TerrAqua Survey Platform API',
            version: '1.0.0',
            description: 'API documentation for TerrAqua Survey Platform - A comprehensive GPS tracking and waypoint management system',
            contact: {
                name: 'TerrAqua Team',
                email: 'support@terraqua.com'
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT'
            }
        },
        servers: [
            {
                url: 'https://terr-aqua-survey-platform-backend.vercel.app',
                description: 'Production server'
            },
            {
                url: 'http://localhost:3001',
                description: 'Development server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Enter your JWT token'
                },
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'token',
                    description: 'JWT token stored in HTTP-only cookie'
                }
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'User ID'
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            description: 'User email address'
                        },
                        full_name: {
                            type: 'string',
                            description: 'User full name'
                        },
                        is_verified: {
                            type: 'boolean',
                            description: 'Email verification status'
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Account creation timestamp'
                        }
                    }
                },
                Project: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Project ID'
                        },
                        user_id: {
                            type: 'integer',
                            description: 'Owner user ID'
                        },
                        name: {
                            type: 'string',
                            description: 'Project name'
                        },
                        description: {
                            type: 'string',
                            description: 'Project description'
                        },
                        status: {
                            type: 'string',
                            enum: ['active', 'paused', 'completed'],
                            description: 'Project status'
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time'
                        },
                        updated_at: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                },
                Waypoint: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Waypoint ID'
                        },
                        project_id: {
                            type: 'integer',
                            description: 'Associated project ID'
                        },
                        name: {
                            type: 'string',
                            description: 'Waypoint name'
                        },
                        description: {
                            type: 'string',
                            description: 'Waypoint description'
                        },
                        latitude: {
                            type: 'number',
                            format: 'double',
                            description: 'Latitude coordinate'
                        },
                        longitude: {
                            type: 'number',
                            format: 'double',
                            description: 'Longitude coordinate'
                        },
                        elevation: {
                            type: 'number',
                            format: 'double',
                            description: 'Elevation in meters'
                        },
                        accuracy: {
                            type: 'number',
                            format: 'double',
                            description: 'GPS accuracy in meters'
                        },
                        image_url: {
                            type: 'string',
                            description: 'Cloudinary image URL'
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                },
                Track: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Track ID'
                        },
                        project_id: {
                            type: 'integer',
                            description: 'Associated project ID'
                        },
                        coordinates: {
                            type: 'array',
                            items: {
                                type: 'array',
                                items: {
                                    type: 'number'
                                },
                                minItems: 2,
                                maxItems: 2
                            },
                            description: 'Array of [longitude, latitude] coordinates'
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                },
                Error: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'string',
                            description: 'Error message'
                        },
                        message: {
                            type: 'string',
                            description: 'Detailed error description'
                        }
                    }
                }
            }
        },
        tags: [
            {
                name: 'Authentication',
                description: 'User authentication and authorization endpoints'
            },
            {
                name: 'Projects',
                description: 'Project management endpoints'
            },
            {
                name: 'Waypoints',
                description: 'Waypoint management endpoints'
            },
            {
                name: 'Tracks',
                description: 'GPS track management endpoints'
            },
            {
                name: 'Upload',
                description: 'File upload endpoints'
            },
            {
                name: 'Health',
                description: 'API health check endpoints'
            }
        ]
    },
    apis: ['./routes/*.js', './server.js']
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
