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
        imageLink: book.imagelink
    });
});
let notes = [];
const existingNotes = await db.query("select * from notesdata");
existingNotes.rows.forEach(note => {
    notes.push({
        id: note.id,
        noteDate: note.note_date,
        notes: note.notes,
        bookId: note.book_id
    });
});
let reviews = [];
const existingReviews = await db.query("select * from reviews");
existingReviews.rows.forEach(review => {
    reviews.push({
        id: review.id,
        dateFinished: review.date_finished,
        rating: review.rating,
        bookId: review.book_id
    });
});
app.get("/", (req, res) => {
    console.log(books);
    console.log(notes);
    console.log(reviews);
    res.render("index.ejs", {bookData: books, notesData: notes});
});

let fivePossibleBooks = [];
app.get("/new", (req, res) => {
    res.render("new.ejs", {bookInfos: fivePossibleBooks});
});

app.get("/notes", (req, res) => {
    const selectedBook = books.find(b => b.id == req.query.selectedBookId);
    res.render("notes.ejs", {book: selectedBook, reviews: reviews});
});

app.get("/edit", async (req, res) => {
    const selectedBookId = req.query.selectedBookId;
    const selectedBookNotes = await db.query("select * from notesdata\
        where book_id = $1", [selectedBookId]);
    console.log(selectedBookNotes.rows);
    res.render("edit.ejs", {notes: selectedBookNotes.rows, reviews: reviews});
});

app.post("/edit-review", async (req, res) => {
    console.log(req.body);
    const index = reviews.findIndex(r => r.bookId == req.body.bookId);
    if (req.body.finished) {
        const result = await db.query("update reviews\
            set rating = $1,\
            date_finished = $2\
            where book_id = $3\
            returning id", [req.body.rating, req.body.dateFinished, req.body.bookId]);

        reviews[index] = {
            id: result.rows.id,
            dateFinished: req.body.dateFinished,
            rating: req.body.rating,
            bookId: req.body.bookId
        };
    } else {
        await db.query("delete from reviews where book_id = $1", [req.body.bookId]);
        reviews.splice(index, 1);
    }
    console.log(reviews);
    res.redirect(`/edit?selectedBookId=${req.body.bookId}`);
});

app.post("/edit-notes", async (req, res) => {
    await db.query("update notesdata\
        set note_date = $1,\
        notes = $2\
        where id = $3", [req.body.noteDate, req.body.notes, req.body.id]);
    const index = notes.findIndex(n => n.id == req.body.id);
    notes[index].id = parseInt(req.body.id);
    notes[index].noteDate = req.body.noteDate;
    notes[index].notes = req.body.notes;
    res.redirect(`/edit?selectedBookId=${notes[index].bookId}`);
});

app.post("/new-note", async (req, res) => {
    console.log(req.body);
    const noteDate = req.body.noteDate;
    const newNotes = req.body.notes;
    const bookId = req.body.id;
    const notesResult = await db.query("insert into notesdata (note_date, notes, book_id)\
        values ($1, $2, $3)\
        returning id", [noteDate, newNotes, bookId]);
    notes.push({
        id: notesResult.rows.id,
        noteDate: noteDate,
        notes: newNotes,
        bookId: bookId
    });
    if (req.body.finished) {
        const dateFinished = req.body.dateFinished;
        const rating = parseInt(req.body.rating);
        const reviewsResult = await db.query("insert into reviews (date_finished, rating, book_id)\
            values ($1, $2, $3)\
            returning id", [dateFinished, rating, bookId]);
        reviews.push({
            id: reviewsResult.rows.id,
            dateFinished: dateFinished,
            rating: rating,
            bookId: bookId
        });
    }
    res.redirect("/");
});

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
        res.redirect("/new");
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
        imageLink: imageLink
    });

    res.redirect("/");
});

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});