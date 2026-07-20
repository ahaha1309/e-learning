# E-Learning LMS Scaffold

This repository now includes the Module 1 foundation plus Module 2 authentication for a server-rendered LMS built with Node.js, Express, MongoDB, and Pug.

## Prerequisites
- Node.js 20 or newer
- MongoDB 7 or newer

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in the required values.
3. Start MongoDB locally or point `MONGO_URL` to a reachable database.
4. Run the app:
   ```bash
   npm start
   ```

## Development
```bash
npm run dev
```

## Validation
```bash
npm run check
```

## Docker
The included `docker-compose.yml` starts MongoDB and the application shell for local development.

## Authentication
- `GET /auth/register` and `POST /auth/register`
- `GET /auth/login` and `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`
- `GET /auth/google`, `GET /auth/google/callback`
- `GET /auth/facebook`, `GET /auth/facebook/callback`
