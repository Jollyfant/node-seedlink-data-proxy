# nodejs-seedlink-data-proxy
Lightweight NodeJS server capable of communicating over the Seedlink protocol, broadcasting unpacked data samples through HTML5 websockets. When a client connects to the proxy server, a connection is relayed over the seedlink protocol. This connection is severed when no clients are available and kept alive while clients are connected. The server has support for streaming data from multiple remote Seedlink servers to different subscribers.


## Installation

    npm install

## Configuration
Modify config.json to suit your needs.

## Room Configuration
A channel describes a configured data stream that can be subcribed to and is identified by a name. Each channel will create a single Seedlink connection when users are subscribed. Users that are subscribed to a channel will receive data packets attributed to that particular channel.

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

Once accepted, the server will start writing over the websocket. An unlimited number of subscriptions can be active per user.

## Client Example

    var exampleSocket = new WebSocket("ws://0.0.0.0:8087");

    exampleSocket.onopen = function(event) {
        exampleSocket.send(JSON.stringify({"subscribe": "NL.HGN"}));
    }

    exampleSocket.onmessage = function(event) {
        console.log(event.data);
    }

Will starting receiving data from configured channel `NL.HGN`:

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
