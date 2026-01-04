// ==========================================================
// CONFIGURATION & DOM ELEMENTS
// ==========================================================

// !! CRITICAL FIX: Ensure this is 3000 to match server.js
const BASE_URL = 'http://127.0.0.1:3000/api'; 

// Form IDs
const publisherForm = document.getElementById('publisherForm');
const bookForm = document.getElementById('bookForm');
const authorForm = document.getElementById('authorForm');
const branchForm = document.getElementById('branchForm');
const copiesForm = document.getElementById('copiesForm');
const cardForm = document.getElementById('cardForm');
const lendingForm = document.getElementById('lendingForm');

// ==========================================================
// A. SECTION TOGGLE & NAVIGATION LOGIC 
// ==========================================================

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const targetBtn = document.querySelector(`.nav-btn[onclick="showSection('${sectionId}')"]`);
    if(targetBtn) {
        targetBtn.classList.add('active');
    }
}

function getCurrentSectionId() {
    const activeSection = document.querySelector('.section.active');
    return activeSection ? activeSection.id : 'dashboard'; 
}

function reShowCurrentSection() {
    // Adding a small delay helps ensure the server has time to process the delete/insert 
    setTimeout(() => {
        const currentSectionId = getCurrentSectionId(); 
        initializeApp();        
        showSection(currentSectionId); 
    }, 100); 
}

// ==========================================================
// B. DATA FETCHING AND DISPLAY 
// ==========================================================

function getDeleteKeys(tableId, record) {
    switch (tableId) {
        case 'publishersTable':
            return { keys: [record.NAME], route: 'publishers' };
        case 'booksTable':
            return { keys: [record.BOOK_ID], route: 'books' };
        case 'branchesTable':
            return { keys: [record.BRANCH_ID], route: 'branches' };
        case 'cardsTable':
            return { keys: [record.CARD_NO], route: 'cards' };
        case 'copiesTable': 
            // Keys must be BOOK_ID and BRANCH_ID, which are returned by the server
            return { keys: [record.BOOK_ID, record.BRANCH_ID], route: 'book_copies' };
        default:
            return null;
    }
}

// NEW CODE TO ADD TO app.js
// Function to format the ISO date string (YYYY-MM-DDTHH:mm:ss.000Z) to YYYY-MM-DD
function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString); 
        // This ensures only the date part is returned, removing the time and 'Z'.
        return date.toISOString().split('T')[0]; 
    } catch (e) {
        return dateString; // Fallback: return original if parsing fails
    }
}

// REPLACE YOUR EXISTING FUNCTION WITH THIS CODE
async function fetchAndRenderTable(apiUrl, tableId, columnsArray) {
    const tableBody = document.querySelector(`#${tableId} tbody`);
    // Check if tableBody exists before trying to access innerHTML
    if (!tableBody) {
        console.error(`Table body element with ID #${tableId} tbody not found in HTML.`);
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="100%">Loading...</td></tr>'; 

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            const errorDetails = await response.text();
            // This displays the error you were seeing (e.g., 404 or 500)
            tableBody.innerHTML = `<tr><td colspan="100%" style="color:red; font-weight: bold;">
                Error fetching data: HTTP error status: ${response.status} - ${errorDetails.substring(0, 100)}...
            </td></tr>`;
            console.error(`Fetch Error (${tableId}):`, errorDetails);
            return;
        }
        const records = await response.json();

        if (records.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="100%">No records found.</td></tr>';
            return;
        }

        const deletable = getDeleteKeys(tableId, {});
        
        // Dynamic Header Check 
        const headerRow = document.querySelector(`#${tableId} thead tr`);
        if (headerRow) {
            let headerHtml = columnsArray.map(col => `<th>${col}</th>`).join('');
            if (deletable) {
                headerHtml += '<th>Actions</th>';
            }
            headerRow.innerHTML = headerHtml;
        }


        let html = '';
        records.forEach(record => {
            html += '<tr>';
            columnsArray.forEach(key => { 
                let value = record[key] === null || record[key] === undefined ? '' : record[key];
                
                // === START OF DATE FORMATTING FIX ===
                // Only format dates for the recentLendings table and the specific date keys
                if (tableId === 'recentLendings' && (key === 'DATE_OUT' || key === 'DUE_DATE')) {
                    value = formatDate(value); 
                }
                // === END OF DATE FORMATTING FIX ===
                
                html += `<td>${value}</td>`; 
            });

            // ADD DELETE BUTTON CELL
            if (deletable) {
                const deleteKeys = getDeleteKeys(tableId, record);
                
                // CRITICAL: Encode parameters for URL safety 
                const encodedParams = deleteKeys.keys.map(key => encodeURIComponent(key)).join('/');
                
                html += `<td><button class="delete-btn" onclick="deleteRecord('${deleteKeys.route}', '${encodedParams}')">Delete</button></td>`;
            }

            html += '</tr>';
        });

        tableBody.innerHTML = html;

    } catch (error) {
        console.error(`Failed to fetch data for ${tableId}:`, error);
        tableBody.innerHTML = `<tr><td colspan="100%" style="color:red;">Error fetching data: ${error.message}</td></tr>`;
    }
}

async function loadDashboardStats() {
    const statsGrid = document.getElementById('statsGrid');
    if (!statsGrid) return;
    statsGrid.innerHTML = '';
    try {
        const response = await fetch(`${BASE_URL}/stats`);
        const stats = await response.json();

        const data = [
            { label: 'Total Books', value: stats.totalBooks },
            { label: 'Total Branches', value: stats.totalBranches },
            { label: 'Total Cards', value: stats.totalCards }
        ];

        data.forEach(stat => {
            statsGrid.innerHTML += `
                <div class="stat-card">
                    <div class="stat-number">${stat.value}</div>
                    <div class="stat-label">${stat.label}</div>
                </div>
            `;
        });
        
        fetchAndRenderTable(`${BASE_URL}/lendings`, 'recentLendings', ['BookTitle', 'BranchName', 'CARD_NO', 'DATE_OUT', 'DUE_DATE']);

    } catch (error) {
        console.error('Failed to load dashboard stats:', error);
        statsGrid.innerHTML = '<p style="color: red;">Failed to load stats.</p>';
    }
}

// ==========================================================
// C. FORM SUBMISSION HANDLER
// ==========================================================

async function handleSubmission(e, formElement, apiUrl, resetForm = true) {
    e.preventDefault();

    const formId = formElement.id;
    let inputs = {};

    // Map frontend IDs to backend keys (uses TEXT INPUTS from the correct HTML)
    switch (formId) {
        case 'publisherForm':
            inputs.name = document.getElementById('publisherName').value;
            inputs.phone = document.getElementById('publisherPhone').value;
            inputs.address = document.getElementById('publisherAddress').value;
            break;
        case 'bookForm':
            inputs.bookId = document.getElementById('bookId').value;
            inputs.title = document.getElementById('bookTitle').value;
            inputs.pubYear = document.getElementById('pubYear').value;
            inputs.publisherName = document.getElementById('bookPublisher').value; // <--- Reads from text input
            break;
        case 'authorForm':
            inputs.authorName = document.getElementById('authorName').value;
            inputs.bookId = document.getElementById('authorBookId').value;
            break;
        case 'branchForm':
            inputs.branchId = document.getElementById('branchId').value;
            inputs.branchName = document.getElementById('branchName').value;
            inputs.branchAddress = document.getElementById('branchAddress').value;
            break;
        case 'copiesForm':
            inputs.noOfCopies = document.getElementById('copyCount').value;
            inputs.bookId = document.getElementById('copyBookId').value;
            inputs.branchId = document.getElementById('copyBranchId').value;
            break;
        case 'cardForm':
            inputs.cardNo = document.getElementById('cardNo').value;
            break;
        case 'lendingForm':
            inputs.dateOut = document.getElementById('dateOut').value;
            inputs.dueDate = document.getElementById('dueDate').value;
            inputs.bookId = document.getElementById('lendingBookId').value;
            inputs.branchId = document.getElementById('lendingBranchId').value;
            inputs.cardNo = document.getElementById('lendingCardNo').value;
            break;
        default:
            return;
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputs) 
        });

        const responseText = await response.text();
        let data = { message: "Operation successful." };
        
        try { 
            data = JSON.parse(responseText); 
        } catch (e) {
             // If response is not JSON (e.g., a raw HTML 500 error), alert the raw status
            if (!response.ok) {
                alert(`Failed: ${response.status} ${response.statusText}. Check server console.`);
                return;
            }
        }

        if (response.ok) {
            alert('Success: ' + (data.message || 'Record added successfully!'));
            if (resetForm) formElement.reset();
            
            reShowCurrentSection(); 
        } else {
            // Display the specific MySQL error or custom message
            const errorMsg = data.sqlMessage || data.message || response.statusText || 'Server error occurred.';
            alert(`Failed: Database Error: ${errorMsg}`);
        }
    } catch (error) {
        console.error('Submission Error:', error);
        alert('Could not connect to server or process data.');
    }
}

// ==========================================================
// D. DELETE HANDLER 
// ==========================================================

async function deleteRecord(route, params) {
    if (!confirm(`Are you sure you want to delete the record for ${route} with key(s): ${params}? This action is irreversible.`)) {
        return;
    }

    const apiUrl = `${BASE_URL}/${route}/${params}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'DELETE',
        });

        if (response.ok) {
            alert('Success: Record deleted successfully!');
            reShowCurrentSection();
        } else {
            const errorText = await response.text();
            let errorMsg = `Failed to delete record: ${response.status} ${response.statusText}`;
            try {
                const data = JSON.parse(errorText);
                errorMsg = data.sqlMessage || data.message || errorMsg;
            } catch (e) {
                // Use default message if response is not JSON
            }
            alert(`Delete Failed: ${errorMsg}`);
        }
    } catch (error) {
        console.error('Delete Error:', error);
        alert('Could not connect to server to execute delete operation.');
    }
}


// --- Attach Handlers to Forms ---
publisherForm.addEventListener('submit', (e) => handleSubmission(e, publisherForm, `${BASE_URL}/publishers`));
bookForm.addEventListener('submit', (e) => handleSubmission(e, bookForm, `${BASE_URL}/books`));
authorForm.addEventListener('submit', (e) => handleSubmission(e, authorForm, `${BASE_URL}/authors`));
branchForm.addEventListener('submit', (e) => handleSubmission(e, branchForm, `${BASE_URL}/branches`));
copiesForm.addEventListener('submit', (e) => handleSubmission(e, copiesForm, `${BASE_URL}/book_copies`));
cardForm.addEventListener('submit', (e) => handleSubmission(e, cardForm, `${BASE_URL}/cards`));
lendingForm.addEventListener('submit', (e) => handleSubmission(e, lendingForm, `${BASE_URL}/lendings`));


// ==========================================================
// E. INITIALIZATION
// ==========================================================

function initializeApp() {
    // Load Tables
    fetchAndRenderTable(`${BASE_URL}/publishers`, 'publishersTable', ['NAME', 'PHONE', 'ADDRESS']);
    fetchAndRenderTable(`${BASE_URL}/books`, 'booksTable', ['BOOK_ID', 'TITLE', 'PUB_YEAR', 'PUBLISHER_NAME', 'Authors']);
    fetchAndRenderTable(`${BASE_URL}/branches`, 'branchesTable', ['BRANCH_ID', 'BRANCH_NAME', 'ADDRESS']);
    fetchAndRenderTable(`${BASE_URL}/book_copies`, 'copiesTable', ['NO_OF_COPIES', 'BookTitle', 'BranchName']);
    fetchAndRenderTable(`${BASE_URL}/cards`, 'cardsTable', ['CARD_NO']);
    
    // Load Dashboard
    loadDashboardStats();
}

document.addEventListener('DOMContentLoaded', () => {
    showSection('dashboard'); 
    initializeApp();
});