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

app.post("/add", async (req, res) => {
    try {
        const googleResponse = await axios.get(GOOGLE_API_URL + "?q=" + encodeURI(req.body.newBook));
        const data = googleResponse.data.items;
        let books = [];
        for (let i = 0; i < 5; i++) {
            const book = data[i];
            if (book.volumeInfo.imageLinks) {
                books.push({
                    id: book.id,
                    imageLink: book.volumeInfo.imageLinks.thumbnail
                });
            }
        }
        res.render("new.ejs", {bookInfos: books});
    } catch (err) {
        console.error("Failed to make request:", err.message);
        res.status(500).send("Failed to fetch activity");
    }
});

app.post("/select", (req, res) => {
    console.log(req.body.selectedBookId);
    res.render("index.ejs");
})

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});