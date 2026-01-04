const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
// !! CHANGE: process.env.PORT is required for deployment platforms like Render
const PORT = process.env.PORT || 3000;

// --- CLOUD DATABASE CONNECTION (AIVEN) ---
const pool = mysql.createPool({
    host: 'mysql-234b6473-fawazshaik473-d954.l.aivencloud.com', // From your Aiven screenshot
    user: 'avnadmin',                                            // From your Aiven screenshot
    password: 'AVNS_LnFwSOx7lofUtcTs0kb',        // !! REVEAL password in Aiven console and paste here
    database: 'library_db',                                       // From your Aiven screenshot
    port: 13767,                                                // From your Aiven screenshot
    ssl: {
        rejectUnauthorized: false                                // !! REQUIRED for cloud connections like Aiven
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const db = pool.promise();

// Check connection on startup
db.getConnection()
    .then(() => console.log('✅ Connected to Aiven Cloud MySQL Database.'))
    .catch(err => {
        console.error('❌ Error connecting to Aiven:', err.message);
        // Don't exit immediately in production, but log clearly
    });

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to handle database queries
async function safeQuery(sql, params, req, res) {
    try {
        const [results] = await db.query(sql, params);
        if (req.method === 'GET') {
            res.status(200).json(results);
        } else if (req.method === 'DELETE') {
            if (results.affectedRows === 0) {
                 return res.status(404).json({ message: 'Record not found for deletion.' });
            }
            res.status(200).json({ message: 'Operation successful (Deleted).' });
        } else {
            res.status(201).json({ message: 'Operation successful.', insertId: results.insertId });
        }
    } catch (err) {
        console.error(`❌ Query Error (${req.method} ${req.path}):`, err.message, err.sqlMessage);
        res.status(500).json({ 
            message: `Failed to execute database operation for ${req.path}.`, 
            sqlMessage: err.sqlMessage || err.message 
        });
    }
}

// ==========================================================
// API ROUTES (KEEPING ALL YOUR EXISTING ROUTES)
// ==========================================================

app.get('/api/publishers', async (req, res) => {
    await safeQuery('SELECT NAME, PHONE, ADDRESS FROM PUBLISHER', [], req, res);
});
app.post('/api/publishers', async (req, res) => {
    const { name, phone, address } = req.body;
    await safeQuery('INSERT INTO PUBLISHER (NAME, PHONE, ADDRESS) VALUES (?, ?, ?)', [name, phone, address], req, res);
});
app.delete('/api/publishers/:name', async (req, res) => {
    const { name } = req.params;
    await safeQuery('DELETE FROM PUBLISHER WHERE NAME = ?', [name], req, res);
});

app.get('/api/books', async (req, res) => {
    const sql = `
        SELECT B.BOOK_ID, B.TITLE, B.PUB_YEAR, B.PUBLISHER_NAME,
        GROUP_CONCAT(A.AUTHOR_NAME SEPARATOR ', ') AS Authors
        FROM BOOK B
        LEFT JOIN BOOK_AUTHOR A ON B.BOOK_ID = A.BOOK_ID
        GROUP BY B.BOOK_ID, B.TITLE, B.PUB_YEAR, B.PUBLISHER_NAME;`;
    await safeQuery(sql, [], req, res);
});
app.post('/api/books', async (req, res) => {
    const { bookId, title, pubYear, publisherName } = req.body;
    await safeQuery('INSERT INTO BOOK (BOOK_ID, TITLE, PUB_YEAR, PUBLISHER_NAME) VALUES (?, ?, ?, ?)', [bookId, title, pubYear, publisherName], req, res);
});
app.delete('/api/books/:bookId', async (req, res) => {
    const { bookId } = req.params;
    await safeQuery('DELETE FROM BOOK WHERE BOOK_ID = ?', [bookId], req, res);
});

app.post('/api/authors', async (req, res) => {
    const { authorName, bookId } = req.body;
    await safeQuery('INSERT INTO BOOK_AUTHOR (AUTHOR_NAME, BOOK_ID) VALUES (?, ?)', [authorName, bookId], req, res);
});

app.get('/api/branches', async (req, res) => {
    await safeQuery('SELECT BRANCH_ID, BRANCH_NAME, ADDRESS FROM LIBRARY_BRANCH', [], req, res);
});
app.post('/api/branches', async (req, res) => {
    const { branchId, branchName, branchAddress } = req.body;
    await safeQuery('INSERT INTO LIBRARY_BRANCH (BRANCH_ID, BRANCH_NAME, ADDRESS) VALUES (?, ?, ?)', [branchId, branchName, branchAddress], req, res);
});
app.delete('/api/branches/:branchId', async (req, res) => {
    const { branchId } = req.params;
    await safeQuery('DELETE FROM LIBRARY_BRANCH WHERE BRANCH_ID = ?', [branchId], req, res);
});

app.get('/api/book_copies', async (req, res) => {
    const sql = `
        SELECT C.NO_OF_COPIES, B.TITLE AS BookTitle, L.BRANCH_NAME AS BranchName,
               C.BOOK_ID, C.BRANCH_ID 
        FROM BOOK_COPIES C
        JOIN BOOK B ON C.BOOK_ID = B.BOOK_ID
        JOIN LIBRARY_BRANCH L ON C.BRANCH_ID = L.BRANCH_ID;`;
    await safeQuery(sql, [], req, res);
});
app.post('/api/book_copies', async (req, res) => {
    const { noOfCopies, bookId, branchId } = req.body;
    await safeQuery('INSERT INTO BOOK_COPIES (NO_OF_COPIES, BOOK_ID, BRANCH_ID) VALUES (?, ?, ?)', [noOfCopies, bookId, branchId], req, res);
});
app.delete('/api/book_copies/:bookId/:branchId', async (req, res) => {
    const { bookId, branchId } = req.params;
    await safeQuery('DELETE FROM BOOK_COPIES WHERE BOOK_ID = ? AND BRANCH_ID = ?', [bookId, branchId], req, res);
});

app.get('/api/cards', async (req, res) => {
    await safeQuery('SELECT CARD_NO FROM CARD', [], req, res);
});
app.post('/api/cards', async (req, res) => {
    const { cardNo } = req.body;
    await safeQuery('INSERT INTO CARD (CARD_NO) VALUES (?)', [cardNo], req, res);
});
app.delete('/api/cards/:cardNo', async (req, res) => {
    const { cardNo } = req.params;
    await safeQuery('DELETE FROM CARD WHERE CARD_NO = ?', [cardNo], req, res);
});

app.get('/api/lendings', async (req, res) => {
    const sql = `
        SELECT B.TITLE AS BookTitle, L.BRANCH_NAME AS BranchName, 
        BL.CARD_NO, BL.DATE_OUT, BL.DUE_DATE
        FROM BOOK_LENDING BL
        JOIN BOOK B ON BL.BOOK_ID = B.BOOK_ID
        JOIN LIBRARY_BRANCH L ON BL.BRANCH_ID = L.BRANCH_ID
        ORDER BY BL.DATE_OUT DESC LIMIT 10;`;
    await safeQuery(sql, [], req, res);
});
app.post('/api/lendings', async (req, res) => {
    const { dateOut, dueDate, bookId, branchId, cardNo } = req.body;
    await safeQuery('INSERT INTO BOOK_LENDING (DATE_OUT, DUE_DATE, BOOK_ID, BRANCH_ID, CARD_NO) VALUES (?, ?, ?, ?, ?)', 
        [dateOut, dueDate, bookId, branchId, cardNo], req, res);
});

app.get('/api/stats', async (req, res) => {
    try {
        const [bookCount] = await db.query('SELECT COUNT(*) AS count FROM BOOK');
        const [branchCount] = await db.query('SELECT COUNT(*) AS count FROM LIBRARY_BRANCH');
        const [cardCount] = await db.query('SELECT COUNT(*) AS count FROM CARD');
        res.status(200).json({
            totalBooks: bookCount[0].count,
            totalBranches: branchCount[0].count,
            totalCards: cardCount[0].count
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch statistics.' });
    }
});

// START SERVER
app.listen(PORT, () => {
    console.log(`🚀 Server running online (Port: ${PORT})`);
});