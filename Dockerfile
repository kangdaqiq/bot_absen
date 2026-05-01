FROM node:18-alpine

WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

RUN npm install

# Copy all source files
COPY . .

# Set timezone
ENV TZ=Asia/Jakarta

CMD ["npm", "start"]
