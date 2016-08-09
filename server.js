/** 
 * Port the HTTP server providing the REST API runs on 
 */
var SERVER_PORT = 8888;

/** Service to use for logging into google server. Must be either 'google'
 * or 'ptc'
 */
var POKEMON_LOGIN_TYPE = '';

/**
 * Login name of either the Pokemon server login
 */
var POKEMON_LOGIN_NAME = '';

/**
 * Password for the Pokemon server login
 */
var POKEMON_LOGIN_PASSWORD = '';

/**
 * Minimum time between two Pokemon searches, in ms. The actual time will 
 * depend on how much the user moves (more movement = more searches). 
 */
var POKEMON_MIN_SEARCH_INTERVAL = 30000;

/**
 * Maximum time between two Pokemon searches, in ms. The actual time will 
 * depend on how much the user moves (more movement = more searches). 
 */
var POKEMON_MAX_SEARCH_INTERVAL = 360000;

/**
 * Radius to search for Pokemon around the user if the user is stationary 
 * (e.g. is at home or a restaurant), in meters.
 * Combined with POKEMON_STATIONARY_SEARCH_CELLSIZE this defines how many
 * requests are sent to the Pokemon server for a stationary search. Since
 * the Pokemon server requires a 5s delay between each request, it should be
 * made sure we don't send too many requests.
 */
var POKEMON_STATIONARY_SEARCH_RADIUS = 50;

/**
 * Radius to search for Pokemon around the user if the user is moving 
 * (e.g. walking or on a bike), in meters.
 * Combined with POKEMON_MOVING_SEARCH_CELLSIZE this defines how many
 * requests are sent to the Pokemon server for a moving search. Since
 * the Pokemon server requires a 5s delay between each request, it should be
 * made sure we don't send too many requests.
 */
var POKEMON_MOVING_SEARCH_RADIUS = 500;

var POKEMON_STATIONARY_SEARCH_CELLSIZE = 100;

var POKEMON_MOVING_SEARCH_CELLSIZE = 250;

/** 
 * An array of pokedex numbers of pokemon we do not want to be informed of. 
 */
var IGNORED_POKEMON = [
  10, //caterpie
  11, //metapod
  13, //weedle
  14, //kakuna
  16, //pidgey
  17, //pidgeotto
  19, //rattata
  20, //raticate
  21, //spearow
  22, //fearow
  41, //zubat
  42, //golbat
  46, //paras
  47, //parasect
  48, //venonat
  52, //meowth
  53, //persian
  54, //psyduck
  55, //golduck
  79, //slowpoke
  80, //slowbro
  96, //drowzee
  97, //hypno
  98, //krabby
  99, //kingler
  118, //goldeen
  119, //seaking
  120, //staryu
  121, //starmie
];

/** 
 * A list of pokedex numbers of pokemon we DEFINETLY want to catch and should
 * receive special treatment. 
 */
var NICE_POKEMON = [
  1, //bulbausar
  2, //ivysaur
  3, //venusaur
  4, //charmander
  5, //charmeleon
  6, //charizard
  8, //wartortle
  9, //blastoise
  24, //arbok
  26, //raichu
  27, //sandshrew
  28, //sandslash
  30, //nidorina
  31, //nidoqueen
  34, //nidoking
  36, //clefable
  37, //vulpix
  38, //ninetales
  40, //wigglytuff
  45, //vileplume
  49, //venomoth
  51, //dugtrio
  57, //primeape
  58, //glowlithe
  59, //arcanine
  61, //poliwhirl
  62, //poliwrath
  64, //kadabra
  65, //simsala
  66, //machop
  67, //machoke
  68, //machamp
  71, //victreebel
  73, //tentacruel
  74, //geodude
  75, //graveler
  76, //golem
  77, //ponyta
  78, //rapidash
  82, //magneton
  83, //farfetched
  84, //dodudo
  85, //dodrio
  87, //dewgong
  88, //grimer
  89, //muk
  91, //cloyster
  95, //onyx
  101, //electrode
  102, //exeggcute
  103, //exeggutor
  104, //cubone
  105, //marowak
  106, //hitmonlee
  107, //hitmonchan
  110, //weezing
  111, //rhyhorn
  112, //rhydon
  113, //chansey
  114, //tangela
  115, //kangaskhan
  117, //seadra
  123, //scyther
  124, //jynx
  126, //magmar
  127, //pinsir
  128, //tauros
  130, //gyarados
  131, //lapras
  132, //ditto
  134, //vaporeon
  135, //jolteon
  136, //flareon
  137, //porygon
  139, //omastar
  140, //kabuto
  141, //kabutops
  142, //aerodactyl
  143, //snorlax
  144, //articuno
  145, //zapdos
  146, //moltres
  148, //dragonair
  149, //dragonite
  150, //mewtwo
  151, //mew
];

/** 
 * A list of pokedex numbers of pokemon that are supposed to be uncatchable.
 * Seeing one of those we want to be notified ALL THE TIME, drop everything,
 * crash the car and CATCH IT! 
 */
var LEGENDARY_POKEMON = [
  132, //ditto
  144, //articuno
  145, //zapdos
  146, //moltres
  150, //mewtwo
  151, //mew
]

/** 
 * Saves the Apple Push Notification Token that represents our client device 
 */
var pushtoken;

var disableSearch = false;

var forceSearch = false;

/** The last user location reported by the client device */
var location = {};

/** Indicates that the location has been updated since the last pokemon
    search */
var locationIsDirty = false;

var locationUpdateTimestamp;

var userSpeedHistory = {};

var userSpeed = 0;

/** An array of pokemon encounters that have been sent to the client device */
var notifiedPokemon = [];

/** The timestamp of the last pokemon search.
    Setting this to way in the past ensures we will do an initial search. */
var lastSearchTimestamp = Date.now() - POKEMON_MAX_SEARCH_INTERVAL;

//
// REST API SETUP
//
// We set  up a REST API that the client device can use to easily send us
// information. This is mainly used for the client device to send location
// updates to the server

var express = require('express');
var bodyParser = require('body-parser');

var app = express();
app.use(bodyParser());

//settoken is used to make the client's Apple Push Notification token known
//to the server
app.post('/settoken/:token', function(req, res) {
  var token = req.params.token;
  pushtoken = token;

  console.log("Received APN token: "+token);
});

//setlocation is used for client position updates
//it also uses the net location to calculate the user's current speed
app.post('/setlocation/:lat/:long', function(req, res) {
  var lat = parseFloat(req.params.lat);
  var long = parseFloat(req.params.long);

  //Calculate the user's current speed
  if (location && locationUpdateTimestamp) {
    var distance = distanceBetweenCoordinates(
      { longitude: location.longitude, latitude: location.latitude},
      { longitude: long, latitude: lat}
    );
    var time = (Date.now() - locationUpdateTimestamp)/1000.0;

    //sometimes we get a couple of inital values very fast, which can mess with
    //the speed. prevent that.
    if (time >= 1) {
      userSpeed = (distance/time)/1000*60*60; // m/s to km/h
    }

    var now = Date.now();

    //Write the new location value to the speed history
    if (time > 0) userSpeedHistory[now] = { time: time, speed: (distance/time)/1000*60*60 };

    //Clear the history, remove any values older than 90 seconds, but keep
    //at least two
    var historyLength = Object.keys(userSpeedHistory).length;
    for (var key in userSpeedHistory) {
      if ((now-key) > 180000 && historyLength > 2) {
        delete userSpeedHistory[key];
        historyLength--;
      } 
    }

    var distanceTotal = 0;
    var n = 0;
    var lastSpeed = -1;
    for (var key in userSpeedHistory) {
      var currentSpeed = userSpeedHistory[key].speed;
      var weight = userSpeedHistory[key].time;

      //If the difference between two measurements is large, assume an error
      //and weigh this measurement down
      if (lastSpeed >= 0) {
        if (Math.abs(lastSpeed-currentSpeed) > 10) {
          // weight /= 10;
          continue;
        }
        else if (Math.abs(lastSpeed-currentSpeed) > 5) {
          weight /= 5;
        }
        else if (Math.abs(lastSpeed-currentSpeed) > 3) {
          weight /= 2;
        }
      }
      distanceTotal += currentSpeed * weight;
      n += weight;

      lastSpeed = currentSpeed;
    }
    var weightedSpeed = distanceTotal/n;
  }

  location = { latitude: lat, longitude: long };

  locationUpdateTimestamp = Date.now();
  locationIsDirty = true;
});

function calculateSpeed() {
  var distanceTotal = 0;
  var n = 0;
  var lastKey;
  for (var key in userSpeedHistory) {
    var currentSpeed = userSpeedHistory[key].speed;
    var weight = userSpeedHistory[key].time;

    //If the difference between two measurements is large, assume an error
    //and weigh this measurement down
    // if (lastSpeed >= 0) {
    var lastSpeed = 0;
    if (lastKey) lastSpeed = userSpeedHistory[lastKey].speed;

    if (Math.abs(lastSpeed-currentSpeed) <= 10) {
      distanceTotal += currentSpeed * weight;
      n += weight;
    }

    lastKey = key;
  }

  if (lastKey === undefined) return 0;

  var timeSinceLastKey = (Date.now() - lastKey)/1000.0;

  if (timeSinceLastKey > 90) return 0;

  //add the seconds since the last location update as "not moving"
  n += timeSinceLastKey;

  return distanceTotal/n;
}

//forcesearch forces a new pokemon search as soon as possible
//this should be used very sparingly, mostly if the client just started to force
//the initial map population
app.post('/forcesearch', function(req, res) {
  forceSearch = true;
});

var server = app.listen(SERVER_PORT, '0.0.0.0', function () {
  var host = server.address().address
  var port = server.address().port
  console.log("Example app listening at http://%s:%s", host, port);
});

app.post('/setenabled/:enabled', function(req, res) {
  var enabled = parseInt(req.params.enabled);

  if (enabled == false || enabled == 0) {
    console.log("Search disabled");
    disableSearch = true;
  } else {
    console.log("Search re-enabled");
    disableSearch = false;
  }
});

var forceRadius = "auto";

app.post('/forceradius/:radius', function(req, res) {
  console.log("Forcing radius at "+new Date().toISOString());
  var radius = req.params.radius;

  if (radius == "auto" || radius == "stationary" || radius == "moving") {
    forceRadius = radius;
    console.log("Forcing search radius "+radius);
  }
});


//
// APPLE PUSH SETUP
//
// We use Apple Push Notifications to send pokemon information to the iOS client
// In order for this to work, a valid Push certificate is needed and key.pem
// and cert.pem must be in the server folder.
// Further, we need the target device's token, which the iOS client will provide
// to us when it is started

var apn = require('apn');

var apnConnection = new apn.Connection({});
var pushDevice;

initAPN();

function initAPN() {
  pushtoken = "98c9cd541dc510214db21a22d27323f1e70cbb4a5e5aaa535df34eee298d8505";
  if (!pushtoken) {
    console.log("No token received yet, delaying APN connection... ");
    setTimeout(initAPN, 5000);
    return;
  }

  //We have our token, create the push target device
  pushDevice = new apn.Device(pushtoken);
}

function sendPushNotification(message, payload, soundfile) {
  if (!pushDevice) return false;

  var note = new apn.Notification();
  note.expiry = Math.floor(Date.now() / 1000) + 15*60; // Expires 15 minutes from now.
  note.contentAvailable = true;
  note.badge = 0;
  note.sound = soundfile;
  note.alert = message;
  note.payload = payload;

  apnConnection.pushNotification(note, pushDevice);

  return true;
}


//
// POKEMON SETUP
//
// Here we make our connection to the pokemon server and set up the pokemon
// searches. Since searching pokemon is the major part of the code, it has
// a separate section further down below

// var Pokeio = require('pokemon-go-node-api');
var Pokeio = require('./Pokemon-GO-node-api/poke.io.js');
var s2 = require('s2geometry-node');

var checkInterval;

initPokeConnection();

function initPokeConnection() {
  //In case we reconnect to the pokemon server, we need a fresh
  //playerInfo object, otherwise we will not get a new server connection
  Pokeio.playerInfo = {
    accessToken: '',
    debug: true,
    latitude: 0,
    longitude: 0,
    altitude: 0,
    locationName: '',
    provider: '',
    apiEndpoint: ''
  };

  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = undefined;
  }

  //If this connection does not have all information gathered, try later
  if (!location.latitude || !location.longitude) {
    console.log("No location received yet, delaying pokeconnection");
    setTimeout(initPokeConnection, 5000);
    return;
  }

  console.log("Connecting to Pokemon servers...");

  Pokeio.init(
    POKEMON_LOGIN_NAME,
    POKEMON_LOGIN_PASSWORD,
    { type: 'coords', coords: { latitude: location.latitude, longitude: location.longitude } },
    POKEMON_LOGIN_TYPE,
    didPokeLogin
  );
}

function didPokeLogin(error) {
  if (error) {
    console.log("Error login into Pokemon");
    console.log(error);

    //Usually, the servers never recover from HB errors
    //Therefore, reconnect and repeat this search immediately
    setTimeout(function() {
      forceSearch = true;
      initPokeConnection();
    }, 30000);
    
    return;
  }

  console.log("Did log in to Pokemon servers");

  //We are fully connected, search pokemon!
  checkInterval = setInterval(checkSearchPokemon, 5000);
}

//
// SEARCH & NOTIFY ABOUT POKEMON
//
// This is where the magic happens - using all the stuff gathered above
// we search for nearby pokemon and send notifications about found pokemon
// to the iOS client

var searchInProgress = false;

function checkSearchPokemon() {
  //We can never run two searches at the same time, as this might get us
  //banned from the Pokemon server!
  if (searchInProgress) return;

  var timeSinceLastSearch = Date.now()-lastSearchTimestamp;
  var timeSinceLastLocationUpdate = Date.now() - locationUpdateTimestamp;

  //The iOS client only reports its location if it changed significantly
  //This can lead to the user being detected as moving if he becomes stationary
  //directly after moving (e.g. in a car)
  //Therefore, if we don't receive a location update for a while we just assume
  //the user being stationary
  //Note that this is not perfect, since this will also trigger if the user has
  //no internet connection
  // var adjustedUserSpeed = userSpeed;
  // if (timeSinceLastLocationUpdate >= 90000) adjustedUserSpeed = 0;
  var adjustedUserSpeed = calculateSpeed();

  if (!forceSearch) { //if force search is on, we jump over all the guards
    if (disableSearch) return;

    var now = new Date();
    var nowString = padZero(new Date().getHours())
      +":"+padZero(new Date().getMinutes())
      +":"+padZero(new Date().getSeconds());

    console.log("["+nowString+"] Time since last search: "+(timeSinceLastSearch/1000.0));
    console.log("Time since location update: "+(timeSinceLastLocationUpdate/1000.0));
    console.log("Speed: "+adjustedUserSpeed.toFixed(1));

    //We don't want to annoy the pokemon servers in a car
    if (adjustedUserSpeed >= 25) return;

    //If the user is very slow or stationary, we don't want to spam the
    //servers - postpone searching as long as possible
    if (adjustedUserSpeed < 1 && timeSinceLastSearch < POKEMON_MAX_SEARCH_INTERVAL) return;

    //If there is no other reason making it sensible to have a new search, don't
    //Good reasons are updates in the user location or too much time has passed
    //since the last search, meaning that new pokemon could have arrived even
    //if the user didn't move
    if (!locationIsDirty && timeSinceLastSearch < POKEMON_MAX_SEARCH_INTERVAL) return;
  } else {
    console.log("Force search is active");
  }

  //We start a new recursive search for pokemon
  //The accuracy and radius is dependent on user movement. Usually we want to
  //look at a larger area when the user is moving, but don't need to be as exact
  //since the user movement will trigger new searches rather quickly
  var cellSize = POKEMON_MOVING_SEARCH_CELLSIZE;
  var searchRadius = POKEMON_MOVING_SEARCH_RADIUS;
  if (adjustedUserSpeed < 2) {
    cellSize = POKEMON_STATIONARY_SEARCH_CELLSIZE;
    searchRadius = POKEMON_STATIONARY_SEARCH_RADIUS;
  }

  //The user can overwrite the move mode in the UI
  if (forceRadius == "stationary") {
    cellSize = POKEMON_STATIONARY_SEARCH_CELLSIZE;
    searchRadius = POKEMON_STATIONARY_SEARCH_RADIUS; 
  }
  if (forceRadius == "moving") {
    cellSize = POKEMON_MOVING_SEARCH_CELLSIZE;  
    searchRadius = POKEMON_MOVING_SEARCH_RADIUS;
  }

  console.log("STARTING POKEMON SEARCH in "+searchRadius+"m radius,  "+cellSize+" cell size and "+Math.round((searchRadius*2)/cellSize)+" grid size");
  console.log("User location is "+location.latitude+", "+location.longitude);

  searchPokemonRecursive(
    location.latitude,
    location.longitude,
    //the number of cells per axis needed to cover the search area
    Math.round((searchRadius*2)/cellSize), 
    //cellSize is given in meters, translate to latLng
    metersToLatLong(cellSize).latitude
  );

  forceSearch = false;
  locationIsDirty = false;
}

function searchPokemonRecursive(centerLat, centerLong, gridSize, cellSize, step) {
  if (step === undefined) step = 0;

  searchInProgress = true;

  if (step >= (gridSize*gridSize)) {
    searchInProgress = false;
    return;
  }

  //move from center to the origin
  var originLat  = centerLat  - (gridSize/2)*cellSize;
  var originLong = centerLong - (gridSize/2)*cellSize;

  //move from origin (0,0) to center of first grid cell
  var newLat  = originLat  + cellSize/2;
  var newLong = originLong + cellSize/2;

  //now move to the grid cell appropriate for step
  newLat  += cellSize * (step%gridSize);
  newLong += cellSize * Math.floor(step/gridSize);

  // console.log("annotation = [[MKPointAnnotation alloc] init];");
  // console.log("annotation.coordinate = CLLocationCoordinate2DMake("+newLat+", "+newLong+");");
  // console.log("[self addAnnotation:annotation];");

  searchPokemon(newLat, newLong, function(successCode) {
    //There are three possible outcomes of a search, indicated by code:
    // 0 - search successful
    //-1 - search aborted because user moved out of search s2geometry
    //-2 - pokemon server reported an error

    //If the search was not a success, it doesn't make much sense to try further
    //We abort the recursive search, but set forceSearch to true so it is 
    //restarted ASAP
    if (successCode < 0) {
      searchInProgress = false;
      forceSearch = true;

      //If the pokemon server reported an error we need to reconnect in order
      //to allow future searches
      if (successCode == -2) {
        initPokeConnection();
      }
    } else {
      //The Pokemon API only allows a search ~every 5 seconds, wait long enough
      //and then gogo
      setTimeout(function() {
        searchPokemonRecursive(centerLat, centerLong, gridSize, cellSize, step+1);
      }, 5500);
    }
  });
}

function searchPokemon(lat, long, cb) {
  //First, make sure the app knows we do a search
  lastSearchTimestamp = Date.now();
  // locationIsDirty = false;
  // forceSearch = false;

  // console.log("Searching for pokemon at "+lat+", "+long);
  // console.log("annotation = [[MKPointAnnotation alloc] init];");
  // console.log("annotation.coordinate = CLLocationCoordinate2DMake("+lat+", "+long+");");
  // console.log("[self addAnnotation:annotation];");

  //We might have moved during the search, so that this search is not 
  //necessary anymore
  if (distanceBetweenCoordinates(location, { latitude: lat, longitude: long }) > POKEMON_MOVING_SEARCH_RADIUS) {
    console.log("Aborting search due to user movement");
    if (cb) cb(-1);

    return;
  }

  Pokeio.SetLocation(
    { type: 'coords', coords: { latitude: lat, longitude: long } },
    didUpdateGameLocation
  );

  function didUpdateGameLocation(error) {
    if (error) {
      console.log("Error updating location for Pokemon");
      console.log(error);

      if (cb) cb(-2);

      return;
    }

    Pokeio.Heartbeat(function(error, hb) {
      if (error) {
        console.log("Pokemon Heartbeat Error");
        console.log(error);

        if (cb) cb(-2);

        return;
      }

      console.log("Looking for wild Pokemon at "+lat+", "+long);

      //Walk over all returned cells and look if they contain wild pokemon
      for (var i = hb.cells.length - 1; i >= 0; i--) {
        for (var p = 0; p < hb.cells[i].WildPokemon.length; p++) {
          var wildPokemon = hb.cells[i].WildPokemon[p];

          if (wildPokemon.TimeTillHiddenMs <= 0) continue;

          //Pokeio supports grabbing extended pokemon info (e.g. name) 
          var pokemon = Pokeio.pokemonlist[parseInt(wildPokemon.pokemon.PokemonId)-1];

          var pokemonNumber = parseInt(pokemon.id);

          if (IGNORED_POKEMON.indexOf(pokemonNumber) != -1) {
            continue;
          }

          //TODO We could check if it is humanly possible to reach that pokemon
          //by checking the time to vanish and the distance. If it can't be
          //reached with 25km/h, we suppress the notification

          console.log("WILD There is a "+pokemon.name+" at "+wildPokemon.Latitude+", "+wildPokemon.Longitude+" that will vanish in "+Math.floor(wildPokemon.TimeTillHiddenMs/1000.0/60.0)+" min");

          var specialty = 0;
          if (NICE_POKEMON.indexOf(pokemonNumber) != -1) specialty = 1;
          if (LEGENDARY_POKEMON.indexOf(pokemonNumber) != -1) specialty = 2;

          var encounterID = wildPokemon.EncounterId.low 
            + "" 
            + wildPokemon.EncounterId.high;

          if (specialty < 2 
            && notifiedPokemon.indexOf(encounterID) != -1) {
            console.log("DUPLICATE");
            continue;
          }

          var didSend = sendPokemonPushNotification(pokemon, wildPokemon, specialty);
          if (didSend) notifiedPokemon.push(encounterID);
        }
      }

      if (cb) cb(0);
    });
  }
}

function sendPokemonPushNotification(pokemon, info, specialty) {
  if (specialty === undefined) specialty = 0;

  // console.log(pokemon);
  // console.log(info);

  var distanceToPokemon = distanceBetweenCoordinates(
    { longitude: location.longitude, latitude: location.latitude},
    { longitude: info.Longitude, latitude: info.Latitude}
  );
  distanceToPokemon = Math.ceil(distanceToPokemon);

  var vanishTimestamp = Date.now() + info.TimeTillHiddenMs;
  var vanishTime = new Date(vanishTimestamp);
  var vanishTimeString = padZero(vanishTime.getHours())+":"+padZero(vanishTime.getMinutes());
  var vanishMinutes = Math.floor(info.TimeTillHiddenMs/1000.0/60.0);

  var message = "A wild "+pokemon.name+" in "+distanceToPokemon+"m (vanishes at "+vanishTimeString+")";
  // var message = "A wild "+pokemon.name+" in "+distanceToPokemon+"m (vanishes in "+vanishMinutes+" min)";
  if (specialty == 1) message = "CATCH 'EM ALL! "+message;
  if (specialty == 2) message = "[⚠️⚠️ LEGENDARY ⚠⚠️] HOLY! A WILD "+pokemon.name+"! GET THERE UNTILLEGENDARY] HOLY! A WILD "+pokemon.name+"! GET THERE UNTIL "+vanishTimeString+"!";

  //The payload is read by the iOS client application
  //The protocol must be the same on both sides
  var payload = {
    'id'            : info.EncounterId.low+""+info.EncounterId.high,
    'pokemonNumber' : pokemon.id,
    'pokemonName'   : pokemon.name,
    'latitude'      : info.Latitude,
    'longitude'     : info.Longitude,
    // 'vanishesAt'    : (vanishTimestamp/1000.0)
    'vanishesAt': vanishTime.toISOString()
  };

  //The iOS client has all the pokemon cries onboard - we play the right one
  var soundfile = pokemon.id+".mp3";

  return sendPushNotification(message, payload, soundfile);
}


//
// MISC
//

/** 
 * Calculates the distance between two location on earth given by latitude
 * and longitude (in degrees).
 * Thanks http://www.movable-type.co.uk/scripts/latlong.html 
 */
function distanceBetweenCoordinates(coord1, coord2) {
  var R = 6371e3; 
  var φ1 = degToRad(coord1.latitude);
  var φ2 = degToRad(coord2.latitude);
  var Δφ = degToRad(coord2.latitude-coord1.latitude);
  var Δλ = degToRad(coord2.longitude-coord1.longitude);

  var a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  var d = R * c;

  return d;
}

/**
 * Takes a distance in meters, and approximates the latitude and longitude that
 * represents the given distance.
 * 
 * @param {any} m
 * @returns An object with entries 'latitude' and 'longitude'. Each entry 
 *  contains the input distance converted.
 */
function metersToLatLong(m) {
  //We use an approximation here:
  //1 deg lat  = 110574m
  //1 deg long = 111320m * cos(latInRad)

  var lat = m/110574;
  var long = m/(111320 * Math.cos(degToRad(lat)));

  return { latitude: lat, longitude: long };
}

/**
 * Simple degree to radians conversion
 * 
 * @param {any} rad A value in degrees
 * @returns The degrees converted to radians
 */
function degToRad(deg) {
  return deg * (Math.PI/180);
}

/**
 * Simple radians to degree conversion
 * 
 * @param {any} rad A value in radians
 * @returns The radians converted to degrees
 */
function radToDeg(rad) {
  return rad * (180/Math.PI);
}

/**
 * Preprends a string with a zero if it only a single character. Can be used,
 * for example, to format the hours/minutes/seconds of a time string.
 * 
 * @param {any} string An arbitrary string
 * @returns The string prepended with a 0 if it had length 1, otherwise the 
 *  input string
 */
function padZero(string) {
  string = ""+string; //make sure we got a string
  if (string.length == 1) return "0"+string;
  return string;
}
