# Dockerfile for building NodeJS Seedlink Latency connector
#
# Build the container:
# $ docker build -t seedlink-latencies:1.0 .
#
# And run the container (may omit the -e flags):
# $ docker run --rm -p 8087:8087 -e "SERVICE_PORT=8087" -e "SERVICE_HOST=0.0.0.0" seedlink-latencies:1.0

FROM node:8

# Add metadata
LABEL maintainer="Mathijs Koymans"
LABEL email="koymans@knmi.nl"

# Set the work directory
WORKDIR /usr/src/app

# Copy the package json and install NPM dependencies (libxmljs)
COPY package*.json ./
RUN npm install

# Copy the rest of the source
COPY . .

# Set default environment variables
ENV SERVICE_HOST="" \
    SERVICE_PORT="" \
    SEEDLINK_HOST="" \
    SEEDLINK_PORT=""

EXPOSE 8087

CMD ["npm", "start"]
