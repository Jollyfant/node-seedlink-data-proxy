# nodejs-seedlink-data-proxy
A proxy written for NodeJS that relays unpacked data samples from configured Seedlink servers. The data samples are available through HTML5 websockets.

## Installation

    npm install

## Configuration
Modify config.json to suit your needs.

## Room Configuration
A room describes a certain channel that can be subcribed to and is identified by a name. Each room will create a single Seedlink connection when users are subscribed. Users that are subscribed to a room will receive data packets attributes to that channel.

## Running

    node index.js

## Docker

    docker build -t seedlink-proxy:1.0 .
    docker run -p 8087:8087 [--rm] [-d] [-e "SERVICE_PORT=8087"] [-e "SERVICE_HOST=0.0.0.0"] seedlink-proxy:1.0

Four envrionment variables can passed to Docker run to modify settings at runtime. Otherwise information is read from the built configuration file.

  * SERVICE\_HOST
  * SERVICE\_PORT

## Websocket API
To communicate with the websocket server you will need to write an (un)subscription to the socket:

    {"subscribe": "NL.HGN"}
    {"unsubscribe": "NL.HGN"}

Once accepted, the server will start writing over the websocket. Multiple subscriptions can be active per user.

## Example

    var exampleSocket = new WebSocket("ws://0.0.0.0:8087");
    exampleSocket.send(JSON.stringify({"subscribe": "NL.HGN"}))

    exampleSocket.onmessage = function(event) {
        console.log(event.data);
    }

Will receive:

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
