import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";

const app = express();
const port = 3000;
const GOOGLE_API_URL = "https://www.googleapis.com/books/v1/volumes";

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "books",
    password: "B1llyButcher",
    port: 5432,
});
  
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

let books = [];
const existingBooks = await db.query("select * from booksdata");
existingBooks.rows.forEach(book => {
    books.push({
        id: book.id,
        title: book.title,
        author: book.author,
        description: book.description,
        imageLink: book.imagelink,
        notes: book.notes
    });
});
app.get("/", (req, res) => {
    res.render("index.ejs", {bookData: books});
});

app.get("/new", (req, res) => {
    res.render("new.ejs");
});

let fivePossibleBooks = [];
app.post("/add", async (req, res) => {
    try {
        const googleResponse = await axios.get(GOOGLE_API_URL + "?q=" + encodeURI(req.body.newBook));
        const data = googleResponse.data.items;
        fivePossibleBooks = [];
        for (let i = 0; i < 5; i++) {
            const book = data[i];
            if (book.volumeInfo.imageLinks) {
                fivePossibleBooks.push({
                    id: book.id,
                    title: book.volumeInfo.title,
                    author: book.volumeInfo.authors[0],
                    description: book.volumeInfo.description,
                    imageLink: book.volumeInfo.imageLinks.thumbnail
                });
            }
        }
        res.render("new.ejs", {bookInfos: fivePossibleBooks});
    } catch (err) {
        console.error("Failed to make request:", err.message);
        res.status(500).send("Failed to fetch activity");
    }
});

app.post("/select", async (req, res) => {
    const selectedBook = fivePossibleBooks.find(book => book.id === req.body.selectedBookId);
    const title = selectedBook.title;
    const author = selectedBook.author;
    const description = selectedBook.description;
    const imageLink = selectedBook.imageLink;
    const result = await db.query("insert into booksdata (title, author, description, imageLink)\
        values ($1, $2, $3, $4)\
        returning id", [title, author, description, imageLink]);
    
    books.push({
        id: result.rows.id,
        title: title,
        author: author,
        description: description,
        imageLink: imageLink,
        notes: null
    });

    res.redirect("/");
});

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});