import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import session from "express-session";
import env from "dotenv";
import GoogleStrategy from "passport-google-oauth2";
import {Strategy} from "passport-local";

const app = express();
const port = 3000;
const saltRounds = 10;
const GOOGLE_API_URL = "https://www.googleapis.com/books/v1/volumes";
env.config();

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true
    })
);

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});
  
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

app.get("/", (req, res) => {
    res.render("home.ejs");
});

app.get("/register", (req, res) => {
    res.render("register.ejs");
});

app.get("/login", (req, res) => {
    res.render("login.ejs");
});

app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) {
            return next(err);
        }
        res.redirect("/");
    });
});

let books = [];
let notes = [];
let reviews = [];
app.get("/books", async (req, res) => {
    if (req.isAuthenticated()) {
        books = [];
        notes = [];
        reviews = [];
        const existingBooks = await db.query("select * from booksdata where user_id = $1",
            [req.user.id]
        );
        existingBooks.rows.forEach(book => {
            books.push({
                id: book.id,
                title: book.title,
                author: book.author,
                description: book.description,
                imageLink: book.imagelink
            });
        });
        const existingNotes = await db.query("select * from notesdata where user_id = $1",
            [req.user.id]
        );
        existingNotes.rows.forEach(note => {
            notes.push({
                id: note.id,
                noteDate: note.note_date,
                notes: note.notes,
                bookId: note.book_id
            });
        });
        const existingReviews = await db.query("select * from reviews where user_id = $1",
            [req.user.id]
        );
        existingReviews.rows.forEach(review => {
            reviews.push({
                id: review.id,
                dateFinished: review.date_finished,
                rating: review.rating,
                bookId: review.book_id
            });
        });
        res.render("books.ejs", {bookData: books, notesData: notes});
    } else {
        res.redirect("/login")
    }
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
            where user_id = $1\
            order by title asc", [req.user.id]);
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
            where user_id = $1\
            order by $2 asc", [req.user.id, sorting]);
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
    res.redirect("/books");
});

app.get("/delete-book", async (req, res) => {
    const selectedBookId = req.query.selectedBookId;
    const bookIndex = books.findIndex(book => book.id == selectedBookId);
    books.splice(bookIndex, 1);
    const reviewIndex = reviews.findIndex(review => review.bookId == selectedBookId);
    if (reviewIndex >= 0) {
        reviews.splice(reviewIndex, 1);
    }
    for (let notesIndex = 0; notesIndex < notes.length; notesIndex++) {
        if (notes[notesIndex].bookId == selectedBookId) {
            notes.splice(notesIndex, 1);
            notesIndex--;
        }
    }

    await db.query("delete from booksdata where id = $1", [selectedBookId]);
    await db.query("delete from notesdata where book_id = $1", [selectedBookId]);
    await db.query("delete from reviews where book_id = $1", [selectedBookId]);
    res.redirect("/books");
})

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
            id: result.rows[0].id,
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
        return res.redirect("/books");
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
        return res.redirect("/books");
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
    const notesResult = await db.query("insert into notesdata (note_date, notes, book_id, user_id)\
        values ($1, $2, $3, $4)\
        returning id", [noteDate, newNotes, bookId, req.user.id]);
    notes.push({
        id: notesResult.rows[0].id,
        noteDate: noteDate,
        notes: newNotes,
        bookId: bookId
    });
    if (req.body.finished) {
        const dateFinished = req.body.dateFinished;
        const rating = parseInt(req.body.rating);
        const reviewsResult = await db.query("insert into reviews (date_finished, rating, book_id, user_id)\
            values ($1, $2, $3, $4)\
            returning id", [dateFinished, rating, bookId, req.user.id]);
        reviews.push({
            id: reviewsResult.rows[0].id,
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
        console.log(fivePossibleBooks);
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
    const result = await db.query("insert into booksdata (title, author, description, imageLink, user_id)\
        values ($1, $2, $3, $4, $5)\
        returning id", [title, author, description, imageLink, req.user.id]);
    console.log(result.rows);
    books.push({
        id: result.rows[0].id,
        title: title,
        author: author,
        description: description,
        imageLink: imageLink
    });

    res.redirect("/books");
});

app.post(
    "/login",
    passport.authenticate("local", {
        successRedirect: "/books",
        failureRedirect: "/login"
    })
);

app.post("/register", async (req, res) => {
    const email = req.body.username;
    const password = req.body.password;
    try {
        const result = await db.query("select * from users where email = $1", 
            [email]
        );
        if (result.rows.length > 0) {
            res.redirect("/login");
        } else {
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    console.error("Error hashing password:", err);
                } else {
                    const user = await db.query("insert into users (email, password)\
                        values ($1, $2)\
                        returning *", [email, hash]);
                    req.login(user.rows[0], (err) => {
                        if (err) {
                            console.error("Error logging in user:", err);
                        } else {
                            res.redirect("/books");
                        }
                    });
                }
            });
        }
    } catch (err) {
        console.error(err);
    }
});

passport.use("local",
    new Strategy(async function verify(username, password, cb) {
        try {
            const result = await db.query("select * from users where email = $1",
                [username]
            );
            if (result.rows.length > 0) {
                const user = result.rows[0];
                const hashedPassword = user.password;
                bcrypt.compare(password, hashedPassword, (err, valid) => {
                    if (err) {
                        console.error("Error comparing passwords:", err);
                        return cb(err);
                    }
                    if (valid) {
                        return cb(null, user);
                    } else {
                        return cb(null, false);
                    }
                });
            } else {
                return cb("User not found");
            }

        } catch (err) {
            return cb(err);
        }
    })
);

passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});