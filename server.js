var SERVER_PORT = 8888;

var POKEMON_LOGIN_TYPE = 'google'; // 'google' or 'ptc'

var POKEMON_LOGIN_NAME = '';

var POKEMON_LOGIN_PASSWORD = '';

/** Interval in which pokemon can be searched, in ms. Depending on current
    user movement, a search may be delayed up to POKEMON_MAX_SEARCH_INTERVAL
    ms */
var POKEMON_SEARCH_CHECK_INTERVAL = 5000;

/** The maximum time between two pokemon searches, even if the user does not
    move */
var POKEMON_MAX_SEARCH_INTERVAL = 360000;

/** The total radius around the user to search for pokemon. This is the base
    radius, it might be enlarged or shrunk based on user movement. Note that
    increasing this can heavily increase the number of heartbeats send to the
    pokemon servers at seach. */
var POKEMON_SEARCH_RADIUS = 600;

/** The smallest size of one "cell" when searching pokemon. One cell represents
    one heartbeat sent to the pokemon servers. The smaller the cells, the more
    we need to cover POKEMON_SEARCH_RADIUS. Cell size is adjusted between this
    and POKEMON_MAX_SEARCH_CELL_SIZE based on user movement */
var POKEMON_MIN_SEARCH_CELL_SIZE = 100;

/** The largest size of one "cell" when searching pokemon. One cell represents
    one heartbeat sent to the pokemon servers. The smaller the cells, the more
    we need to cover POKEMON_SEARCH_RADIUS. Cell size is adjusted between this
    and POKEMON_MIN_SEARCH_CELL_SIZE based on user movement */
var POKEMON_MAX_SEARCH_CELL_SIZE = 250;

/** A list of pokedex numbers of pokemon we do not want to be informed of. */
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
];

/** A list of pokedex numbers of pokemon we DEFINETLY want to catch and should
    be made aware of repeatedly. This list is pretty much personal taste,
    I mostly entered stuff I still need */
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
  119, //seaking
  121, //starmie
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

/** A list of pokedex numbers of pokemon that are supposed to be uncatchable.
    Seeing one of those we want to be notified ALL THE TIME, drop everything,
    crash the car and CATCH IT! */
var LEGENDARY_POKEMON = [
  132, //ditto
  144, //articuno
  145, //zapdos
  146, //moltres
  150, //mewtwo
  151, //mew
]

/** Saves the Apple Push Notification Token that represents our client device */
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

var Pokeio = require('pokemon-go-node-api');
var s2 = require('s2geometry-node');

var checkInterval;

initPokeConnection();

function initPokeConnection() {
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
  checkInterval = setInterval(checkSearchPokemon, POKEMON_SEARCH_CHECK_INTERVAL);
}

//
// SEARCH & NOTIFY ABOUT POKEMON
//
// This is where the magic happens - using all the stuff gathered above
// we search for nearby pokemon and send notifications about found pokemon
// to the iOS client

function checkSearchPokemon() {
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

    //In general, we try not to spam the servers. Don't search more often than
    //every 30 seconds, no matter what happens.
    //Note: This is different from POKEMON_SEARCH_CHECK_INTERVAL in that a
    //location update should trigger a search asap. Increasing
    //POKEMON_SEARCH_CHECK_INTERVAL to 30 seconds would prevent that.
    if (timeSinceLastSearch < 30000) return;

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
  //The accuracy of that search is determined by the user's current speed and
  //counterintuitive. If the user moves quickly, he will trigger searches more
  //often and from different locations, therefore we can have a looser search
  //If the user is standing still, we only get one search every 5 minutes and
  //need to make sure that search is accurate
  var cellSize = POKEMON_MAX_SEARCH_CELL_SIZE;
  if (adjustedUserSpeed < 2) {
    cellSize = POKEMON_MIN_SEARCH_CELL_SIZE;
  }

  //Search radius is also based on user movement. For a stationary user, we
  //assume he is not willing to travel and only inform him of catchable pokemon
  //The faster the user moves, the more far away pokemon he can reach and
  //we deliver that
  //Note that a user might go to a pokestop and be willing to catch far away
  //pokemon. The user can then overwrite the radius inside the client app
  var searchRadius = POKEMON_SEARCH_RADIUS;
  if (adjustedUserSpeed < 2) {
    searchRadius = 50;
  }

  if (forceRadius == "stationary") {
    searchRadius = 50;
  }
  if (forceRadius == "moving") {
    searchRadius = POKEMON_SEARCH_RADIUS;
  }

  console.log("STARTING POKEMON SEARCH in "+searchRadius+"m radius,  "+cellSize+" cell size and "+Math.round((searchRadius*2)/cellSize)+" grid size");
  console.log("User location is "+location.latitude+", "+location.longitude);

  searchPokemonRecursive(
    location.latitude,
    location.longitude,
    // 6,
    // 0.001
    Math.round((searchRadius*2)/cellSize),
    metersToLatLong(cellSize).latitude
  );
}

function searchPokemonRecursive(centerLat, centerLong, gridSize, cellSize, step) {
  if (step === undefined) step = 0;

  if (step >= (gridSize*gridSize)) {
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

  // searchPokemonRecursive(centerLat, centerLong, gridSize, cellSize, step+1);
  searchPokemon(newLat, newLong, function() {
    searchPokemonRecursive(centerLat, centerLong, gridSize, cellSize, step+1);
  });
}

function searchPokemon(lat, long, cb) {
  //First, make sure the app knows we do a search
  lastSearchTimestamp = Date.now();
  locationIsDirty = false;
  forceSearch = false;

  // console.log("Searching for pokemon at "+lat+", "+long);
  // console.log("annotation = [[MKPointAnnotation alloc] init];");
  // console.log("annotation.coordinate = CLLocationCoordinate2DMake("+lat+", "+long+");");
  // console.log("[self addAnnotation:annotation];");

  Pokeio.SetLocation(
    { type: 'coords', coords: { latitude: lat, longitude: long } },
    didUpdateGameLocation
  );

  function didUpdateGameLocation(error) {
    if (error) {
      console.log("Error updating location for Pokemon");
      console.log(error);
      return;
    }

    // console.log(Pokeio.GetLocationCoords());
    // Pokeio.GetLocation(function(err, addr) {
    //   console.log(err);
    //   console.log(addr);
    // });

    Pokeio.Heartbeat(function(error, hb) {
      if (error) {
        console.log("Pokemon Heartbeat Error");
        console.log(error);

        //Usually, the servers never recover from HB errors
        //Therefore, reconnect and repeat this search immediately
        forceSearch = true;
        initPokeConnection();

        return;
      }

      for (var i = hb.cells.length - 1; i >= 0; i--) {
        for (var p = 0; p < hb.cells[i].WildPokemon.length; p++) {
          var wildPokemon = hb.cells[i].WildPokemon[p];

          //TimeTillHiddenMs < 0 can be reported from the server, ignore
          if (wildPokemon.TimeTillHiddenMs <= 0) continue;

          var pokemon = Pokeio.pokemonlist[parseInt(wildPokemon.pokemon.PokemonId)-1]
          var pokemonNumber = parseInt(pokemon.id);

          if (IGNORED_POKEMON.indexOf(pokemonNumber) != -1) {
            continue;
          }

          //TODO We could check if it is humanly possible to reach that pokemon
          //by checking the time to vanish and the distance. If it can't be
          //reached with 25km/h, we suppress the notification

          console.log("WILD There is a "+pokemon.name+" at "+wildPokemon.Latitude+", "+wildPokemon.Longitude+" that will vanish in "+Math.floor(wildPokemon.TimeTillHiddenMs/1000.0/60.0)+" min");

          //TODO send a notification in certain intervals for NICE_POKEMON
          //(e.g. every 2-3 minutes)

          var specialty = 0;
          if (NICE_POKEMON.indexOf(pokemonNumber) != -1) specialty = 1;
          if (LEGENDARY_POKEMON.indexOf(pokemonNumber) != -1) specialty = 2;

          //We report each pokemon only once - except legendary pokemon, which
          //we want to report as often as possible
          if (specialty < 2 && notifiedPokemon.indexOf(wildPokemon.EncounterId.low+""+wildPokemon.EncounterId.high) != -1) {
            console.log("DUPLICATE");
            continue;
          }

          var didSend = sendPokemonPushNotification(pokemon, wildPokemon, specialty);
          if (didSend) notifiedPokemon.push(wildPokemon.EncounterId.low+""+wildPokemon.EncounterId.high);
        }
      }

      if (cb) cb();
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
  //The client will use that information to draw the pokemon on the map etc.
  var payload = {
    'id'            : info.EncounterId.low+""+info.EncounterId.high,
    'pokemonNumber' : pokemon.id,
    'pokemonName'   : pokemon.name,
    'latitude'      : info.Latitude,
    'longitude'     : info.Longitude,
    'vanishesAt'    : (vanishTimestamp/1000.0)
  };

  //The iOS client has all the pokemon cries onboard - we play the right one
  var soundfile = pokemon.id+".mp3";

  return sendPushNotification(message, payload, soundfile);
}


//
// MISC
//

/** Calculates the distance between two location on earth given by latitude
    and longitude (in degrees).
    Thanks http://www.movable-type.co.uk/scripts/latlong.html **/
function distanceBetweenCoordinates(coord1, coord2) {
  var R = 6371e3; // metres
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

function metersToLatLong(m) {
  //We use an approximation here:
  //1 deg lat  = 110574m
  //1 deg long = 111320m * cos(latInRad)

  var lat = m/110574;
  var long = m/(111320 * Math.cos(degToRad(lat)));

  return { latitude: lat, longitude: long };
}

/** Simple degree to radians conversion */
function degToRad(deg) {
  return deg * (Math.PI/180);
}

function radToDeg(rad) {
  return rad * (180/Math.PI);
}

function padZero(string) {
  string = ""+string; //make sure we got a string
  if (string.length == 1) return "0"+string;
  return string;
}
