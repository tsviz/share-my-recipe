#!/usr/bin/env node

/**
 * Template Consistency Checker
 * 
 * This script checks if all EJS templates are using the shared header and footer partials.
 * It helps maintain consistency across the application's frontend.
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk'); // You may need to install this: npm install chalk

// Configuration
const VIEWS_DIR = path.join(__dirname, '..', 'src', 'views');
const EXCLUDE_DIRS = ['partials']; // Directories to exclude from checking
const EXCLUDE_FILES = []; // Specific files to exclude

// Function to check if a template uses the header and footer partials
function checkTemplate(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const hasHeader = content.includes('<%- include(\'partials/header') || content.includes('<%- include("partials/header');
  const hasFooter = content.includes('<%- include(\'partials/footer') || content.includes('<%- include("partials/footer');
  
  return { hasHeader, hasFooter };
}

// Recursively scan directories for EJS files
function scanDirectory(dir) {
  let issues = [];
  
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip excluded directories
      if (EXCLUDE_DIRS.includes(file)) return;
      
      // Recursively scan subdirectories
      const subIssues = scanDirectory(filePath);
      issues = [...issues, ...subIssues];
    } else if (file.endsWith('.ejs') && !EXCLUDE_FILES.includes(file)) {
      // Check EJS template
      const relativePath = path.relative(VIEWS_DIR, filePath);
      const { hasHeader, hasFooter } = checkTemplate(filePath);
      
      if (!hasHeader || !hasFooter) {
        issues.push({
          file: relativePath,
          missingHeader: !hasHeader,
          missingFooter: !hasFooter
        });
      }
    }
  });
  
  return issues;
}

// Main function
function main() {
  console.log(chalk.blue('Checking EJS templates for consistency...'));
  console.log(chalk.blue(`Scanning directory: ${VIEWS_DIR}\n`));
  
  const issues = scanDirectory(VIEWS_DIR);
  
  if (issues.length === 0) {
    console.log(chalk.green('✓ All templates are using the shared header and footer partials!'));
    process.exit(0);
  }
  
  console.log(chalk.yellow(`Found ${issues.length} template(s) with issues:\n`));
  
  issues.forEach(issue => {
    console.log(chalk.white(`File: ${issue.file}`));
    
    if (issue.missingHeader) {
      console.log(chalk.red('  - Missing header partial'));
      console.log(chalk.gray('    Add: <%- include(\'partials/header\', { title: pageTitle }) %>'));
    }
    
    if (issue.missingFooter) {
      console.log(chalk.red('  - Missing footer partial'));
      console.log(chalk.gray('    Add: <%- include(\'partials/footer\') %>'));
    }
    
    console.log('');
  });
  
  console.log(chalk.yellow('Please fix these issues to ensure consistency across the application.'));
  console.log(chalk.yellow('See docs/frontend-guidelines.md for more information.'));
  
  process.exit(1);
}

// Run the script
main();
