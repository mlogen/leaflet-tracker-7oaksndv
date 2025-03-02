// Script to add Permissions-Policy meta tag to all HTML files
const fs = require('fs');
const path = require('path');

// Directory containing HTML files
const pagesDir = path.join(__dirname, 'pages');

console.log(`Looking for HTML files in: ${pagesDir}`);

try {
    // Get all HTML files in the directory
    const htmlFiles = fs.readdirSync(pagesDir).filter(file => file.endsWith('.html'));
    console.log(`Found ${htmlFiles.length} HTML files: ${htmlFiles.join(', ')}`);

    // Process each HTML file
    htmlFiles.forEach(file => {
        try {
            const filePath = path.join(pagesDir, file);
            console.log(`Processing file: ${filePath}`);
            
            let content = fs.readFileSync(filePath, 'utf8');
            console.log(`File content length: ${content.length} characters`);
            
            // Check if the meta tag already exists
            if (!content.includes('http-equiv="Permissions-Policy"')) {
                console.log(`Meta tag not found in ${file}, adding it...`);
                
                // Add the meta tag after the viewport meta tag
                const newContent = content.replace(
                    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">',
                    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n    <meta http-equiv="Permissions-Policy" content="interest-cohort=()">'
                );
                
                if (content === newContent) {
                    console.log(`Warning: Content unchanged for ${file}. Viewport meta tag might be different.`);
                } else {
                    // Write the updated content back to the file
                    fs.writeFileSync(filePath, newContent, 'utf8');
                    console.log(`Updated ${file} successfully`);
                }
            } else {
                console.log(`${file} already has the meta tag`);
            }
        } catch (fileError) {
            console.error(`Error processing file ${file}:`, fileError);
        }
    });

    console.log('All HTML files have been processed.');
} catch (error) {
    console.error('Error:', error);
} 