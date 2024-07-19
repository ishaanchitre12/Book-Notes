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

app.get("/view", async (req, res) => {
    const selectedBookId = req.query.selectedBookId;
    const selectedBook = books.find(b => b.id == req.query.selectedBookId);
    const selectedBookNotes = await db.query("select * from notesdata\
        where book_id = $1", [selectedBookId]);
    const selectedBookImageLink = books.find(b => b.id == selectedBookId).imageLink;
    res.render("view.ejs", {
        book: selectedBook, 
        notes: selectedBookNotes.rows,
        reviews: reviews,
        cover: selectedBookImageLink
    });
});

app.post("/sort-by", async (req, res) => {
    let result = null;
    const sorting = req.body.sorting;
    if (sorting === "title") {
        result = await db.query("select * from booksdata\
            order by title asc");
        books = [];
        result.rows.forEach(book => {
            books.push({
                id: book.id,
                title: book.title,
                author: book.author,
                description: book.description,
                imageLink: book.imagelink
            });
        });
    } else if (sorting === "date_finished" || sorting === "rating") {
        result = await db.query("select * from reviews\
            order by $1 asc", [sorting]);
        books = [];
        result.rows.forEach(async review => {
            const book = await db.query("select * from booksdata\
                where id = $1", [review.book_id]);
            books.push({
                id: book.rows[0].id,
                title: book.rows[0].title,
                author: book.rows[0].author,
                description: book.rows[0].description,
                imageLink: book.rows[0].imagelink
            });
        });
    }
    res.redirect("/");
});

let inProgressReviews = {};
function checkInProgressReview(body) {
    inProgressReviews = {
        finished: body.finished ? "yes" : "no",
        rating: body.rating,
        dateFinished: body.dateFinished,
        bookId: body.bookId
    };
}

let inProgressNotes = [];
function pushInProgressNotes(id, noteDate, notes, inProgress) {
    const idIndex = id.findIndex(id => id == inProgress);
    console.log(`id: ${id[idIndex]}, date: ${noteDate[idIndex]}, notes: ${notes[idIndex]}`);
    // const inProgressIndex = inProgressNotes.findIndex(note => note.id == id[idIndex]);
    // if (inProgressIndex) {
    //     inProgressNotes[inProgressIndex] = {
    //         id: id[idIndex],
    //         noteDate: noteDate[idIndex],
    //         notes: notes[idIndex]
    //     };
    // } else {
    inProgressNotes.push({
        id: id[idIndex],
        noteDate: noteDate[idIndex],
        notes: notes[idIndex]
    });
    // }
}
function checkInProgressNotes(body) {
    if (Array.isArray(body.inProgressNotes)) {
        body.inProgressNotes.forEach(p => {
            pushInProgressNotes(body.id, body.noteDate, body.notes, p);
        });
    } else {
        if (Array.isArray(body.id)) {
            pushInProgressNotes(body.id, body.noteDate, body.notes, body.inProgressNotes);
        } else {
            inProgressNotes.push({
                id: body.id,
                noteDate: body.noteDate,
                notes: body.notes
            });
        }
    }
}

app.get("/edit", async (req, res) => {
    const selectedBookId = req.query.selectedBookId;
    const selectedBookNotes = await db.query("select * from notesdata\
        where book_id = $1", [selectedBookId]);
    const selectedBookImageLink = books.find(b => b.id == selectedBookId).imageLink;
    console.log(inProgressReviews);
    res.render("edit.ejs", {
        notes: selectedBookNotes.rows, 
        inProgressReview: inProgressReviews,
        inProgressNotes: inProgressNotes,
        reviews: reviews,
        cover: selectedBookImageLink
    });
});

app.post("/edit-review", async (req, res) => {
    console.log(req.body);
    inProgressReviews = {};
    if (req.body.inProgressNotes) {
        checkInProgressNotes(req.body);
    }
    const reviewsIndex = reviews.findIndex(r => r.bookId == req.body.bookId);
    if (req.body.finished) {
        const result = await db.query("update reviews\
            set rating = $1,\
            date_finished = $2\
            where book_id = $3\
            returning id", [req.body.rating, req.body.dateFinished, req.body.bookId]);

        reviews[reviewsIndex] = {
            id: result.rows.id,
            dateFinished: new Date(req.body.dateFinished),
            rating: req.body.rating,
            bookId: req.body.bookId
        };
    } else {
        await db.query("delete from reviews where book_id = $1", [req.body.bookId]);
        reviews.splice(reviewsIndex, 1);
    }
    console.log(reviews);
    res.redirect(`/edit?selectedBookId=${req.body.bookId}`);
});

app.post("/edit-notes", async (req, res) => {
    console.log(req.body);
    const index = inProgressNotes.findIndex(note => note.id == req.body.submittedNote);
    if (index >= 0) {
        inProgressNotes.splice(index, 1);
    }
    if(req.body.inProgressReview || inProgressReviews.finished) {
        checkInProgressReview(req.body);
    }
    if(req.body.inProgressNotes) {
        checkInProgressNotes(req.body);
    }
    let id = "";
    let noteDate = "";
    let newNotes = "";
    if (Array.isArray(req.body.id)) {
        const referringIndex = req.body.id.findIndex(id => id == req.body.submittedNote);
        id = req.body.id[referringIndex];
        noteDate = req.body.noteDate[referringIndex];
        newNotes = req.body.notes[referringIndex];
    } else {
        id = req.body.id;
        noteDate = req.body.noteDate;
        newNotes = req.body.notes;
    }
    await db.query("update notesdata\
        set note_date = $1,\
        notes = $2\
        where id = $3", [noteDate, newNotes, id]);
    const notesIndex = notes.findIndex(n => n.id == id);
    notes[notesIndex].id = parseInt(id);
    notes[notesIndex].noteDate = noteDate;
    notes[notesIndex].notes = newNotes;
    res.redirect(`/edit?selectedBookId=${notes[notesIndex].bookId}`);
});

app.post("/delete-review", async (req, res) => {
    inProgressReviews = {};
    const index = reviews.findIndex(review => review.bookId == req.body.bookId);
    reviews.splice(index, 1);
    await db.query("delete from reviews where book_id = $1", [req.body.bookId]);
    const remainingNotes = notes.find(note => note.bookId == req.body.bookId);
    const remainingReview = reviews.find(review => review.bookId == req.body.bookId);
    if (remainingNotes || remainingReview) {
        return res.redirect(`/edit?selectedBookId=${req.body.bookId}`);
    } else {
        return res.redirect("/");
    }
});

app.post("/delete-note", async (req, res) => {
    console.log(req.body);
    const inProgressIndex = inProgressNotes.findIndex(note => note.id == req.body.deletedNote);
    if (inProgressIndex >= 0) {
        inProgressNotes.splice(inProgressIndex, 1);
    }
    const notesIndex = notes.findIndex(note => note.id == req.body.deletedNote);
    notes.splice(notes, 1);
    await db.query("delete from notesdata where id = $1", [req.body.deletedNote]);
    const remainingNotes = notes.find(note => note.bookId == req.body.bookId);
    const remainingReview = reviews.find(review => review.bookId == req.body.bookId);
    if (remainingNotes || remainingReview) {
        return res.redirect(`/edit?selectedBookId=${req.body.bookId}`);
    } else {
        return res.redirect("/");
    }
});

app.post("/cancel-review-progress", async (req, res) => {
    inProgressReviews = {};
    if (req.body.inProgressNotes) {
        checkInProgressNotes(req.body);
    }
    res.redirect(`/edit?selectedBookId=${req.body.bookId}`);
});

app.post("/cancel-note-progress", async (req, res) => {
    console.log(req.body);
    if (req.body.inProgressNotes) {
        checkInProgressNotes(req.body);
    } 
    const index = inProgressNotes.findIndex(note => note.id == req.body.cancelledNote);
    if (index >= 0) {
        inProgressNotes.splice(index, 1);
    }
    res.redirect(`/edit?selectedBookId=${req.body.bookId}`);
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
            dateFinished: new Date(dateFinished),
            rating: rating,
            bookId: bookId
        });
    }
    res.redirect(`/view?selectedBookId=${bookId}`);
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