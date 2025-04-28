FROM node:18-slim

WORKDIR /app

# Install Python and build tools needed for bcrypt
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Rebuild bcrypt for the current architecture
RUN npm rebuild bcrypt --build-from-source

# Expose port 3000
EXPOSE 3000

# Command to run the application
CMD ["npm", "run", "dev"]