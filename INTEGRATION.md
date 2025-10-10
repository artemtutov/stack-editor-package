# Integration Guide: Using @stack-editor/react in Canvas React

## Setup

### 1. Link the Package

```bash
# In stack-editor-package directory (already done)
cd /Users/artemtutov/Development/stack-editor-package
npm link

# In Canvas React directory
cd /Users/artemtutov/Development/Canvas\ React
npm link @stack-editor/react
```

### 2. Update Canvas React Imports

Edit `/Users/artemtutov/Development/Canvas React/src/pages/StackDemo.tsx`:

```tsx
// Before:
import StackEditor from '../stack-editor/StackEditor'

// After:
import { StackEditor } from '@stack-editor/react'
import '@stack-editor/react/styles.css'
```

### 3. Remove Old stack-editor Folder (Optional)

Once you've confirmed the linked package works:

```bash
cd /Users/artemtutov/Development/Canvas\ React
# Backup first!
mv src/stack-editor src/stack-editor.backup

# If everything works, delete the backup:
# rm -rf src/stack-editor.backup
```

## Development Workflow

### Working on Stack Editor

```bash
# Terminal 1: Develop in isolation
cd /Users/artemtutov/Development/stack-editor-package
npm run dev
# Opens demo at http://localhost:5173
# Make changes, test immediately
```

### Testing in Canvas React

```bash
# Terminal 2: Run Canvas React
cd /Users/artemtutov/Development/Canvas\ React
npm run dev
# Opens at http://localhost:5173 (or different port)
# Navigate to /#/stack-demo
```

**Important**: After making changes to stack-editor-package, you need to rebuild:

```bash
cd /Users/artemtutov/Development/stack-editor-package
npm run build
```

Then refresh your Canvas React app to see changes.

### Hot Reload Option (Advanced)

For true hot reload without manual rebuilds, you can run Vite in watch mode:

```bash
# In stack-editor-package
npm run build -- --watch
```

This rebuilds automatically on file changes, and Canvas React will pick up the changes.

## When You're Ready to Integrate

### Temporary (npm link - for development)

Keep using `npm link` - changes in stack-editor-package are reflected in Canvas React after rebuild.

### Permanent Option 1: Local File Dependency

Add to `Canvas React/package.json`:

```json
{
  "dependencies": {
    "@stack-editor/react": "file:../stack-editor-package"
  }
}
```

Then `npm install`. This copies the package into node_modules.

### Permanent Option 2: Publish to npm

```bash
cd /Users/artemtutov/Development/stack-editor-package
npm publish --access public
```

Then in Canvas React:

```bash
npm install @stack-editor/react
```

## Troubleshooting

### "Module not found" error

Make sure you've:
1. Run `npm link` in stack-editor-package
2. Run `npm link @stack-editor/react` in Canvas React
3. Built the package: `npm run build` in stack-editor-package

### Changes not showing up

Rebuild the package:
```bash
cd /Users/artemtutov/Development/stack-editor-package
npm run build
```

### Want to unlink

```bash
# In Canvas React
npm unlink @stack-editor/react
npm install  # Reinstall normal dependencies
```

## Benefits of This Setup

✅ **Complete isolation** - Break things in stack-editor-package without affecting Canvas React
✅ **Fast iteration** - Dedicated demo for testing
✅ **Clean separation** - Stack editor is its own project
✅ **Reusable** - Can use in other projects
✅ **Easy integration** - Just rebuild and refresh when ready
