//
// Imports
//
const express = require('express');
const neataptic = require('neataptic');
const log = require('logger');
const fs = require('fs');
const URL = require('url').URL;

//
// Globals
//
var app = express();


function randomInt(N)
{
    return Math.floor(Math.random() * N);
}


//
// TODO Move these into another file
//
class TicTacToe
{
    constructor(players)
    {
        this._players = players;
        this._winner = null;
        this._numRoundsPlayed = 0;
        this._firstPlayerIndex = randomInt(players.length);
        this._isGameOver = false;
        this._tokens = ['X', 'O', ' '];
        this._emptyId = players.length;
        this._board = [];
        for (var i=0; i<9; ++i)
        {
            this._board.push(this._emptyId);
        }
    }

    static maxRounds()
    {
        return 5;
    }

    getNumRoundsPlayed()
    {
        return this._numRoundsPlayed;
    }

    isWinner(player)
    {
        return (player.id == this._winner) ? true : false;
    }

    // Lost fast ... almost won... 0 (tie) ... barely won ... Won Fast
    // maxRounds == 5
    // numPlayed = 3, 4, or 5
    // winner: 3, 2, or 1
    // loser: -3, -2, or -1
    scorePlayer(player)
    {
        var isTie = (this._emptyId == this._winner) ? 0.0 : 1.0; // Score of 0 for ties!
        var roundFactor = TicTacToe.maxRounds() - this.getNumRoundsPlayed() + 1.0; // # rounds remaining plus 1
        var isWinner = (this._winner == player.id) ? 1.0 : -1.0; // positive score for winner, negative for loser
        return roundFactor * isTie * isWinner;
    }

    getWinner()
    {
        var b = this._board;
        if (b[0] !== this._emptyId && b[0] === b[1] && b[1] === b[2]) return b[0];
        if (b[3] !== this._emptyId && b[3] === b[4] && b[4] === b[5]) return b[3];
        if (b[6] !== this._emptyId && b[6] === b[7] && b[7] === b[8]) return b[6];
        if (b[0] !== this._emptyId && b[0] === b[3] && b[3] === b[6]) return b[0];
        if (b[1] !== this._emptyId && b[1] === b[4] && b[4] === b[7]) return b[1];
        if (b[2] !== this._emptyId && b[2] === b[5] && b[5] === b[8]) return b[2];
        if (b[0] !== this._emptyId && b[0] === b[4] && b[4] === b[8]) return b[0];
        if (b[2] !== this._emptyId && b[2] === b[4] && b[4] === b[6]) return b[2];

        return (b.filter(x => x === this._emptyId).length === 0) ? this._emptyId : null;
    }

    // Apply the player's move, and analyze the game state
    applyMove(playerIdx, move)
    {
        log.Log("[applyMove] playerIdx: %s, move: %s", playerIdx, move)
        var pid = this._players[playerIdx].id;
        this._board[move] = pid;
        var winner = this.getWinner();
        // If a winner has been determined:
        if (winner != null)
        {
            this._isGameOver = true;
            this._winner = winner;
        }
    }

    playRound()
    {
        log.Log("new round: %s", this._numRoundsPlayed);
        // let each player play their move, starting with the first player.
        for(var i=this._firstPlayerIndex; i<this._firstPlayerIndex + this._players.length; ++i)
        {
            var idx = i % this._players.length;
            var nextMove = this._players[idx].getNextMove(this);
            this.applyMove(idx, nextMove);
            if (this._isGameOver)
            {
                break;
            }
        }
    }

    play()
    {
        while (!this._isGameOver)
        {
            this.playRound();
            this._numRoundsPlayed++;
        }

        log.Log("Winner is \"%s\" [%s]", this._tokens[this._winner], this._winner)
        this.printBoard();
    }

    printBoard()
    {
        var b = this._board;
        var t = this._tokens;
        for (var i in this._players)
        {
            log.Log("Player %s [%s] -- Token: %s", i, this._players[i].name, this._tokens[i]);
        }
        log.Log("%s|%s|%s\n-----\n%s|%s|%s\n-----\n%s|%s|%s",
            t[b[0]], t[b[1]], t[b[2]],
            t[b[3]], t[b[4]], t[b[5]],
            t[b[6]], t[b[7]], t[b[8]]);
    }
}

class Player
{
    constructor(id, name)
    {
        this._id = id;
        this._name = name;
    }

    set id (id)
    {
        this._id = id;
    }

    get id ()
    {
        return this._id;
    }

    set name (name)
    {
        this._name = name;
    }

    get name ()
    {
        return this._name;
    }
}

class NEATPlayer extends Player
{
    constructor(id, options)
    {
        super(id, "NEAT");
        this._genome = options.genome;
    }

    static numInputs()
    {
        return 18;
    }

    static numOutputs()
    {
        return 9;
    }

    getNextMove(game)
    {
        var input = [];
        log.Log("[getNextMove] board [%O] %O", game._board.length, game._board);
        for (var i=0; i<game._board.length; ++i)
        {
            // Each board square gets two inputs. Inputs are encoded as:
            // 0,0 == Empty Space
            // 1,0 == We own it
            // 0,1 == Opponent owns it
            var id = game._board[i];
            input.push((id == this.id) ? 1.0 : 0.0);
            input.push((id != this.id && id != game._emptyId) ? 1.0 : 0.0);
        }
        var output = this._genome.activate(input);
        log.Log("[getNextMove] raw output: %O", output);
        output = output.map(x => Math.round(x));
        log.Log("[getNextMove] input [%O]: %O", input.length, input);
        log.Log("[getNextMove] output [%O]: %O", output.length, output);

        var validMoves = [];
        for (var j in game._board)
        {
            if (game._board[j] === game._emptyId)
            {
                validMoves.push(Number(j));
            }
        }

        log.Log("[getNextMove] valid moves: %O", validMoves);

        // Find the first activated neuron, taking into account valid moves
        var move = -1;
        for (var j in validMoves)
        {
            var k = validMoves[j];
            if (1 <= output[k])
            {
                move = k;
                log.Log("[getNextMove] network selected move: %O", move);
                break;
            }
        }

        // If no neurons were activated, just choose the first available move
        if (-1 == move)
        {
            move = validMoves[0];
            log.Log("[getNextMove] Using auto-selected move: %O", move);
        }

        return move;
    }
}

class RandomPlayer extends Player
{
    constructor(id, options)
    {
        super(id, "Random");
    }

    getNextMove(game)
    {
        // random move
        var moves = [];
        for (var i in game._board)
        {
            if (game._board[i] === game._emptyId)
            {
                moves.push(Number(i));
            }
        }
        log.Log("[Player::getNextMove] moves: %O", moves);
        return moves[randomInt(moves.length)];
    }
}



//
// Returns the score for both genomeA and genomeB
function playGame(config, genomes)
{
    var players = [];
    for (var id in genomes)
    {
        if (genomes[id] === "random")
        {
            players.push(new config.randomPlayer(Number(id), {}));
        }
        else
        {
            var options = {
                "genome": genomes[id]
            }
            players.push(new config.player(Number(id), options));
        }
    }
    var game = new config.game(players);
    game.play();
    return players.map(player => game.scorePlayer(player));
}


//
// Evalulate the genome population. Each genome will be used to play several games.
// The score from each game will be added up and returned as the score for the genome.
//
// @Note: Input is the entire genome population. We're responsible for updating each genome's
// score.
function evaluatePopulation(config, population)
{
    log.Log("Evaluating Population")
    // reset all scores
    for (var i in population)
    {
        population[i].score = 0;
    }

    // Evaluate each genome in the population
    for (var i in population)
    {
        log.Log("Evaluating genome: %O", i);
        i = Number(i);
        var genome = population[i];
        var score = 0;

        // Each genome will play the game against every other genome in the population
        // for `config.rounds` number of games
        for (var j=i+1; j<population.length; ++j)
        {
            log.Log("Playing genome vs genome -- i: %s, j: %s, length: %s", i, j, population.length);
            var players = [genome, population[j]];
            // play 'config.rounds' amount of games with the selected genome
            for (var k=0; k<config.rounds; ++k)
            {
                var scores = playGame(config, players);
                log.Log("player scores: %O", scores);
                for (var l in scores)
                {
                    players[l].score += scores[l];
                    log.Log("Player %s new score: %s (%s)", l, players[l].score, scores[l]);
                }
            }
        }

        // play 'config.rounds' games against a RandomPlayer as well
        var players = [genome, "random"];
        for (var k=0; k<config.rounds*(population.length-1); ++k)
        {
            log.Log("Playing genome vs random");
            var scores = playGame(config, players);
            log.Log("player scores: %O", scores);
            players[0].score += scores[0];
            log.Log("Player new score after random game: %s (%s)", players[0].score, scores[0]);
        }
    }

    neat.sort();
    log.Log("Tournament complete. Highest: %O, Avg: %O", neat.getFittest().score, neat.getAverage());


}

// Pass in a simulation options object. It'll package up the neat options, as well as
// any options required for the games. For example, the inputs/outputs for the network
// are actually properties of the player, and should be passed-in to here.
function initialize_neataptic(config)
{
    log.Instrument("initialize_neataptic");
    var numInputs = config.player.numInputs();
    var numOutputs = config.player.numOutputs();
    var fitnessFunction = function(population) { return evaluatePopulation(config, population); };
    var numHidden = randomInt(4);
    var options = {
        clear: true, // recommended for recurrent networks
        elitism: Math.round(config.populationSize * .2), // 20% elitism
        fitnessPopulation: true, // true == passes entire population array to fitness func, else individual genomes
        mutation: neataptic.methods.mutation.ALL,
        mutationRate: 0.3,
        //mutationAmount: 1,
        popsize: config.populationSize,
        //provenance: Math.round(config.populationSize * .02), // 2% provenance -- copies of the initial random network below:
        //network: new neataptic.architect.Random (
        //    numInputs,
        //    numHidden,
        //    numOutputs
        //)
        //selection: methods.selection.POWER,
        //equal: false, // stimulates more diverse network architectures
    };

    var neat = new neataptic.Neat(
        numInputs,
        numOutputs,
        fitnessFunction,
        options);

    log.InstrumentEnd("initialize_neataptic");//, neat);
    return neat;
}


app.get('/', function (req, res) {
    res.send('Hello World!');
});

app.listen(3000, function () {
    console.log('Example app listening on port 3000!');
});


var config = {
    player: NEATPlayer,
    randomPlayer: RandomPlayer,
    game: TicTacToe,
    rounds: 3,
    populationSize: 100,
    evolutionCycles: 100000
}
log.setEnabled(false);
var neat = initialize_neataptic(config);

var START_COUNT_AT = 0;
var USE_POPULATION;// = "file:///home/ajperez/projects/neataptic/generated/population-latest.json";
var PLAY_GENOME;// = "file:///home/ajperez/projects/neataptic/generated/fittest-35000.json";


if (PLAY_GENOME)
{
    console.log("Playing genome: %O", PLAY_GENOME);
    var json = fs.readFileSync(new URL(PLAY_GENOME));
    var genomeJson = JSON.parse(json);
    log.setEnabled(true);
    var neatPlayerOptions = {
        "genome": neataptic.Network.fromJSON(genomeJson)
    };
    var players = [new RandomPlayer(0, {}), new NEATPlayer(1, neatPlayerOptions)];
    var game = new TicTacToe(players);
    game.play();
}
else
{
    var iterationStart = START_COUNT_AT;
    if (USE_POPULATION)
    {
        console.log("Starting from assigned population: %O", USE_POPULATION);
        var json = fs.readFileSync(new URL(USE_POPULATION));
        var population = JSON.parse(json);
        neat.import(population);
        // If the filename contained a number, assume that number is the iteration count.
        var matches = USE_POPULATION.match("[0-9]+");
        if (matches && matches.length > 0)
        {
            iterationStart = Number(matches[0]) + 1;
        }
    }

    var exportFittest = Math.round(config.evolutionCycles * .01);
    var exportPopulation = Math.round(config.evolutionCycles * .05);
    for (var i=iterationStart; i<=config.evolutionCycles; ++i)
    {
        neat.evolve();
        var fittest = neat.getFittest();

        // Test to see if we reached our goal
        var done = true;
        var numWon = 0;
        for (var j=0; j<100; ++j)
        {
            var players = [fittest, "random"];
            var scores = playGame(config, players);
            if (scores[0] <= 0)
            {
                done = false;
            }
            else
            {
                numWon += 1;
            }
        }

        console.log("After Evolution Cycle %O -- fittest: %O -- %O%% wins vs Random", i, fittest.score, numWon);

        if (i % (exportFittest) == 0 || done)
        {
            var json = JSON.stringify(fittest.toJSON());
            var filename = "generated/fittest-"+i+".json";
            console.log("Exporting to file: %O", filename);
            fs.writeFileSync(filename, json, 'utf8');
        }

        if (i % (exportPopulation) == 0 || done)
        {
            console.log("Exporting population");
            var json = JSON.stringify(neat.export());
            var filename = "generated/population-"+i+".json";
            fs.writeFileSync(filename, json, 'utf8');
        }

        if (i % 100 == 0)
        {
            console.log("Exporting latest population");
            var json = JSON.stringify(neat.export());
            var filename = "generated/population-latest.json";
            fs.writeFileSync(filename, json, 'utf8');
        }

        if (done)
        {
            log.Log("genome can beat random player without losing after 100 games.");
            break;
        }
    }
    console.log("Done evolving!");
}

//
// Notes:
// * refactor code to be more rusable.
// * while (!done) - either N iterations OR until it can beat a random player %M of the time out of J games
//
