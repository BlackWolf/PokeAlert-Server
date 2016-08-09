# PokeAlert-Server

Node.js server for the [PokeAlert iOS Application](https://github.com/BlackWolf/PokeAlert-Client-iOS)

## What does it do?
This is a Node.js server that connects to an instance of the [PokeAlert iOS Application](https://github.com/BlackWolf/PokeAlert-Client-iOS). The client supplies your current location, and the server sends requests to the Pokemon Go Server and looks for nearby Pokemon. It then sends Push Notifications to your iOS device if interesting Pokemon are nearby.

## Why is it cool?
You will receive push notifications about nearby Pokemon without running any app in the foreground, which saves battery and is convenient.

## How to install
1. Clone the repo
2. In the root, execute `npm install`
3. Go into `Pokemon-GO-node-api` folder and execute `npm install` 
4. Add valid Apple Push Certificate files to the root folder named `cert.pem` and `key.pem` (for details, see [node-apn](https://github.com/argon/node-apn)).

## How to run
1. Open `server.js`
2. Fill out `POKEMON_LOGIN_TYPE`, `POKEMON_LOGIN_NAME`, and `POKEMON_LOGIN_PASSWORD` with your pokemon login (I recommend not using an account you care about since it might be banned)
3. Adjust `IGNORED_POKEMON` to contain any pokedex number of pokemon you do not want to receive push notifications about
4. Adjust `NICE_POKEMON` to contain any pokedex number of pokemon you want to receive priority messages for
5. Run `server.js`
6. Start the iOS application (see the client's README for details)

You will receive a push notification when an intereting Pokemon is nearby.

## Thanks
Thanks to the people that created  the [Pokemon Go Node API](https://github.com/Armax/Pokemon-GO-node-api) and everybody involved in cracking the API!