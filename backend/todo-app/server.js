const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// Serviranje statičkih fajlova
app.use(express.static(__dirname));

// Ruta za početnu stranicu
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Pokretanje servera
app.listen(port, () => {
    console.log(`Todo aplikacija pokrenuta na http://localhost:${port}`);
}); 