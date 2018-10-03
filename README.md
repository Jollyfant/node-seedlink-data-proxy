# nodejs-seedlink-data-proxy
Lightweight NodeJS websocket server capable of communicating over the Seedlink protocol. The server broadcasts unpacked mSEED data samples through HTML5 websockets. When a client connects to the proxy server, a connection is relayed to a configured seedlink protocol. The server supports data streaming from multiple remote Seedlink servers & channels to different subscribers.


## Installation

    npm install

## Configuration

  - `__DEBUG__` Sets application in debug mode.
  - `__NAME__` - Application name.
  - `HOST` - Hostname exposing the Seedlink proxy server.
  - `PORT` - Port the Seedlink proxy server is exposed on.
  - `HEARTBEAT_INTERVAL_MS` - Number of miliseconds before checking the socket a ping

## Channel Configuration
A channel describes a configured data stream that can be subscribed to and is identified by a name. Each channel will open a single Seedlink connection when users are subscribed. Users that are subscribed to a channel will receive data packets attributed to that particular channel.

## Testing

    npm test

## Running

    npm start

## Docker

    docker build -t seedlink-proxy:1.0 .
    docker run -p 8087:8087 [--rm] [-d] [-e "SERVICE_PORT=8087"] [-e "SERVICE_HOST=0.0.0.0"] seedlink-proxy:1.0

Two envrionment variables can passed to Docker run to modify settings at runtime. Otherwise information is read from the built configuration file.

  * SERVICE\_HOST
  * SERVICE\_PORT

## Client Example
For an example of the client websocket look for `index.html`.

## Websocket API
To communicate with the websocket server you will need to write an operation (e.g. (un)subscription) to the socket:

    // Subscribe and unsubscribe from a channel
    {"subscribe": "NL.HGN"}
    {"unsubscribe": "NL.HGN"}

    // Get a list of the available channels
    {"channels": true} 

Once a subscription is accepted, the server will start writing over the websocket. An unlimited number of subscriptions can be active per user.

## Unpacked mSEED structure
The unpacked mSEED will be formatted as JSON with the following data (samples) & metadata.

    {
        "start": 1531139771269,
        "end": 1531139780894,
        "data": [...],
        "network": "NL",
        "station": "HGN",
        "location": "02",
        "channel": "BHN",
        "sampleRate": 40,
        "id": "NL.HGN.02.BHN"
    }
