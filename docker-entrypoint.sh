#!/bin/bash
set -e

# Clear any previous locks
rm -f /app/data/db/mongod.lock

echo "Starting MongoDB in Replica Set mode..."
mongod --replSet rs0 --dbpath /app/data/db --port 27017 --bind_ip 127.0.0.1 --logpath /app/logs/mongodb.log --fork

# Wait for MongoDB to start
echo "Waiting for MongoDB to be ready..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:27017/ > /dev/null; then
        echo "MongoDB is ready."
        break
    fi
    echo "Waiting for MongoDB to start... ($i/30)"
    sleep 1
done

# Initialize replica set if not already done
if ! mongosh --eval "rs.status()" >/dev/null 2>&1; then
    echo "Initializing replica set rs0..."
    mongosh --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: '127.0.0.1:27017'}]})"
    echo "Waiting for replica set primary selection..."
    sleep 5
fi

echo "Starting ISOMAC Node.js server..."
exec node backend/server.js
