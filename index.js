import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";

const app = express();
const port = 3000;
const GOOGLE_API_URL = "https://www.googleapis.com/books/v1/volumes";

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (req, res) => {
    res.render("index.ejs");
});

app.get("/new", (req, res) => {
    res.render("new.ejs");
});

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});