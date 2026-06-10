#!/bin/sh

# Run the start:docker command
./node_modules/.bin/prisma migrate deploy

# Start the server
node server.js
