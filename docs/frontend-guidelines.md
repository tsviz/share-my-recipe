# Frontend Development Guidelines

## Template Structure

### Shared Partials

All EJS templates should use the shared partials for consistency:

- **Header**: `<%- include('partials/header', { title: pageTitle }) %>`
- **Footer**: `<%- include('partials/footer') %>`

This ensures that any updates to the navigation, styling, or scripts are automatically applied across the entire application.

## Best Practices

1. **Never hardcode repeated elements** like navigation bars, headers, or footers in individual page templates.
   
2. **Pass necessary variables** to the header partial, at minimum:
   ```
   <%- include('partials/header', { title: pageTitle }) %>
   ```

3. **Store common scripts** in the footer partial or in separate JS files.

4. **Use tooltips** for all interactive elements to improve user experience.
   ```
   <a href="/path" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Description">Link Text</a>
   ```

## Checking for Compliance

Run the template consistency check script to ensure all pages are using the shared partials:

```bash
node scripts/check-templates.js
```

This script will identify any templates not properly using the shared header and footer partials.

## CSS Guidelines

1. **Centralize styles** in the header partial or external CSS files.

2. **Use Bootstrap classes** when available instead of custom CSS.

3. **Use consistent color variables** for themed elements.

## Accessibility Guidelines

1. **Always include alt text** for images.

2. **Use ARIA attributes** for custom components.

3. **Ensure sufficient color contrast** for text.

4. **Make sure tooltips** are available for all important interactive elements.
