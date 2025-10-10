# Quick Start Guide

## ✅ Setup Complete!

Your stack editor package has been created at:
```
/Users/artemtutov/Development/stack-editor-package
```

## 🚀 Start Developing

### Option 1: Test in Isolation (Recommended)

```bash
cd /Users/artemtutov/Development/stack-editor-package
npm run dev
```

Opens demo at http://localhost:5173 - Experiment freely without affecting Canvas React!

### Option 2: Link to Canvas React

```bash
# Already linked! Just update Canvas React:
cd /Users/artemtutov/Development/Canvas\ React

# Edit src/pages/StackDemo.tsx:
# Change: import StackEditor from '../stack-editor/StackEditor'
# To: import { StackEditor } from '@stack-editor/react'
#     import '@stack-editor/react/styles.css'

npm run dev
# Navigate to /#/stack-demo
```

## 📁 Project Structure

```
stack-editor-package/
├── src/               # Your component source
│   ├── index.ts       # Main exports
│   ├── useStackEditor.tsx
│   ├── StackEditor.tsx
│   ├── types.ts
│   └── renderers/     # Block components
├── demo/              # Isolated playground
│   └── App.tsx
├── dist/              # Built package
└── README.md          # Full documentation
```

## 🔄 Development Workflow

1. **Make changes** in `src/` or `demo/`
2. **Test in demo**: `npm run dev`
3. **Build for Canvas React**: `npm run build`
4. **Refresh Canvas React** to see changes

## 📚 Next Steps

- Read `README.md` for full API documentation
- Read `INTEGRATION.md` for Canvas React integration details
- Start developing in `src/renderers/NotionBlock.tsx` or create new components!

## 🎯 Your Goals

Now you can:
- ✅ Develop stack editor in complete isolation
- ✅ Test without breaking Canvas React
- ✅ Import back to Canvas React when ready
- ✅ Use in other projects if needed

Happy coding! 🎉
