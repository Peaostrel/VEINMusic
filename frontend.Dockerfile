FROM node:20-alpine
USER node

WORKDIR /app

# Copy package files
COPY --chown=node:node frontend/package*.json ./

# Install dependencies
RUN npm ci --ignore-scripts

# Copy the frontend code
COPY --chown=node:node frontend/ ./

# NEXT_PUBLIC_* values are inlined into the bundle at build time, so they
# must be provided as build args (runtime env vars have no effect).
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_WS_URL=localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

# Build the Next.js application
RUN npm run build

EXPOSE 3000

# Start the application
CMD ["npm", "start"]
