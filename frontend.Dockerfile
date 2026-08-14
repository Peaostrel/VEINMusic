FROM node:20-alpine
USER node

WORKDIR /app

# Copy package files
COPY --chown=node:node frontend/package*.json ./

# Install dependencies
RUN npm ci --ignore-scripts

# Copy the frontend code
COPY --chown=node:node frontend/ ./

# Build the Next.js application
RUN npm run build

EXPOSE 3000

# Start the application
CMD ["npm", "start"]
