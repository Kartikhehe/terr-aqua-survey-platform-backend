# Server: Notes & Maintenance

This directory contains the backend server. Some useful commands and notes:

- Install dependencies:

```
cd server
npm install
```

- Initialize database and run migrations:

```
npm run init-db
```

- Start server (dev watch):

```
npm run dev
```

- Run the auto-pause test harness (creates an expired playing project):
```
node scripts/testAutoPause.js
```

Auto Pause Job
----------------
The server starts a background job that checks for playing projects that haven't had activity for longer than 6 hours and auto-pauses them. This job is started automatically when the server boots.