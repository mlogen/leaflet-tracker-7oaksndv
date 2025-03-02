// Script to add Permissions-Policy meta tag to all HTML files
const fs = require('fs');
const path = require('path');

// Define the directory paths
const rootDir = '.';
const pagesDir = path.join(rootDir, 'pages');

console.log(`Looking for HTML files in: ${pagesDir}`);

// Function to update meta tags in HTML files
function updateMetaTags(filePath) {
    try {
        // Read the file content
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Check if the file already has the old meta tag
        if (content.includes('<meta http-equiv="Permissions-Policy" content="interest-cohort=()">')) {
            // Replace the old meta tag with the new one
            content = content.replace(
                '<meta http-equiv="Permissions-Policy" content="interest-cohort=()">',
                '<meta http-equiv="Permissions-Policy" content="browsing-topics=(), interest-cohort=()">'
            );
            
            // Write the updated content back to the file
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated meta tag in ${filePath}`);
        } else {
            console.log(`No meta tag to update in ${filePath}`);
        }
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
    }
}

// Process the index.html file
const indexPath = path.join(rootDir, 'index.html');
if (fs.existsSync(indexPath)) {
    updateMetaTags(indexPath);
}

// Process all HTML files in the pages directory
if (fs.existsSync(pagesDir)) {
    const files = fs.readdirSync(pagesDir);
    
    files.forEach(file => {
        if (file.endsWith('.html')) {
            const filePath = path.join(pagesDir, file);
            updateMetaTags(filePath);
        }
    });
}

console.log('Meta tag update completed.'); 