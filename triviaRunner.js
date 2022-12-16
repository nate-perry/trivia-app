"use strict";

const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const app = express();
const port = 3000; // Might need to change later, idk how the hosting site works
require("dotenv").config({ path: "credentialsDontPost/.env" });
const { MongoClient, ServerApiVersion } = require('mongodb');

const DB = process.env.MONGO_DB_NAME;
const COLLECTION = process.env.MONGO_COLLECTION;
const uri = `mongodb+srv://${process.env.MONGO_DB_USERNAME}:${process.env.MONGO_DB_PASSWORD}@cluster0.69gbgtq.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

app.set("views", "templates");
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({extended:false}));
app.use(express.static("static"));
app.use(cookieParser());

// Initial Load/Restart
app.get("/", (request, response) => {
  response.render("index", {username: request.cookies.username ?? ""});
});

// Submitting username/starting
app.post("/", async (request, response) => {
  let record = {
    current_score: 0
  };

  let result = await client.db(DB).collection(COLLECTION)
  .updateOne({username: request.body.username}, {$set: record});
  if (result.matchedCount == 0) {
    record.username = request.body.username;
    record.high_score = 0;
    await client.db(DB).collection(COLLECTION)
    .insertOne(record);
  }

  response.cookie("username", request.body.username, {httpOnly: true});
  response.redirect("question");
});

// Loading in question/sending it to DB to hold
app.get("/question", async (request, response) => {
  // get username
  const username = request.cookies.username;

  const localResp = await fetch("https://opentdb.com/api.php?amount=1");
  var data = await localResp.json();
  let {question, correct_answer, incorrect_answers} = data.results[0];

  await client.db(DB).collection(COLLECTION)
  .updateOne({username: username}, {$set: {question, correct_answer}});

  let shuffled_answers = [correct_answer].concat(incorrect_answers);
  shuffled_answers.sort((a, b) => Math.random() - 0.5);
  response.render("question", {question: question, answers: shuffled_answers});
});

// Showing the correct answer and the selected answer to the question
app.post("/answer", async (request, response) => {
  // get username, question, correct answer, and scores
  const username = request.cookies.username;
  let {question, correct_answer, current_score, high_score} = await client.db(DB).collection(COLLECTION)
  .findOne({username: username});
  correct_answer = correct_answer.replaceAll("&amp;", "&");

  // Check if the right answer was selected, and if so update the score (and high score if applicable)
  let correct = false;
  if (request.body.selected == correct_answer) {
    correct = true;
    current_score++;
    let update = {current_score: current_score};
    if (current_score > high_score) update.high_score = current_score;
    await client.db(DB).collection(COLLECTION).updateOne({username: username}, {$set: update});
  }

  response.render("answer", {selected: request.body.selected, correct_answer: correct_answer, question: question, current_score: current_score, correct: correct});
});

// Render Leaderboard
app.get("/leaderboard", async (request, response) => {
  // get username
  const username = request.cookies.username;
  
  // get top 5 players, by score
  let top5 = await client.db(DB).collection(COLLECTION)
  .find().sort({high_score: -1}).limit(5).toArray();
  if (username && top5 && !top5.some(player => player.username === username)) {
    top5[5] = await client.db(DB).collection(COLLECTION).findOne({username: username});
  }

  let table;
  if (top5 && top5.length > 0) {
    table = "<table class=\"leaderboard\">\n<tr><th>Username</th><th>High Score</th></tr>";
    top5.forEach(player => {
      table += `\n<tr><td>${player.username}</td><td>${player.high_score}</td></tr>`;
    });
    table += `\n</table>`;
  } else {
    table = "There are no players! Play a round to be the top of the leaderboard!";
  }

  response.render("leaderboard", {table: table, username: username});
});

app.listen(port);