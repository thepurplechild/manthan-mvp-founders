# Project Review System - Founder's Command Center

## Overview

The Project Review System is a comprehensive interface for founders to review uploaded scripts, monitor AI processing status, and evaluate generated pitch materials. It serves as the primary interface for founders to approve or request revisions on project materials.

## Features

### 🔍 Project Overview
- **Editable project metadata** - Title, description, and project details
- **Status tracking** - Real-time project status with color-coded indicators
- **Progress metrics** - Visual progress indicators and completion statistics
- **Timeline information** - Creation dates, last updates, and processing history

### 📜 Script Management
- **Multi-script support** - Handle multiple script versions and files
- **Content preview** - Full-screen script viewer with syntax highlighting
- **File management** - Download, copy URLs, and manage script versions
- **Processing status** - Track upload and processing status for each script

### ⚙️ AI Processing Dashboard
- **Real-time monitoring** - Live updates on processing pipeline status
- **Step-by-step tracking** - Detailed view of each processing stage
- **Error handling** - Comprehensive error display and retry functionality
- **Performance metrics** - Processing times, queue status, and health monitoring

### 📊 Generated Assets Preview
- **Asset categorization** - Organized by type (pitch decks, summaries, etc.)
- **Preview functionality** - In-app preview of generated content
- **Download management** - Individual and bulk download options
- **Version tracking** - Multiple versions with timestamp and metadata

### ✅ Review & Approval Workflow
- **Approval system** - Streamlined approval with feedback options
- **Revision requests** - Structured feedback with categorization
- **Rating system** - Optional star ratings for project evaluation
- **Audit trail** - Complete history of reviews, approvals, and revisions

## Architecture

### Page Structure
```
/projects/[id]/review/
├── page.tsx                 # Main server component
├── ProjectReviewClient.tsx   # Client-side main component
├── ProjectOverviewSection.tsx
├── ScriptDisplaySection.tsx
├── ProcessingStatusDashboard.tsx
├── GeneratedAssetsSection.tsx
└── ReviewApprovalSection.tsx
```

### API Endpoints
```
/api/projects/[id]/
├── review/      # GET: Fetch complete project review data
├── approve/     # POST: Approve project with optional feedback
├── feedback/    # POST: Submit feedback, GET: Retrieve feedback
└── revisions/   # POST: Request revisions, GET: Get revision requests
```

### Data Management
- **Custom hook** (`useProjectReview`) for state management
- **Real-time updates** with auto-refresh functionality
- **Optimistic updates** for improved user experience
- **Error handling** with retry mechanisms

## Usage

### For Founders

1. **Navigate to Review Page**
   ```
   /projects/{project-id}/review
   ```

2. **Review Project Materials**
   - Check project overview and metadata
   - Review uploaded scripts
   - Monitor AI processing status
   - Preview generated assets

3. **Provide Feedback**
   - Submit general feedback with optional ratings
   - Request specific revisions with categorization
   - Approve projects for production

### For Developers

#### Extending the Review System

1. **Add New Asset Types**
   ```typescript
   // In GeneratedAssetsSection.tsx
   const assetTypes = {
     new_asset_type: {
       name: 'New Asset Type',
       icon: IconComponent,
       color: 'text-color bg-color',
       description: 'Description of new asset type'
     }
   }
   ```

2. **Add Processing Steps**
   ```typescript
   // In ProcessingStatusDashboard.tsx
   const stepOrder = ['extract', 'characters', 'market', 'pitch', 'visuals', 'assembly', 'new_step']
   const stepIcons = {
     new_step: IconComponent
   }
   ```

3. **Customize Approval Workflow**
   ```typescript
   // In ReviewApprovalSection.tsx
   const revisionCategories = [
     { id: 'new_category', label: 'New Category', description: 'Description' }
   ]
   ```

## Responsive Design

### Breakpoints
- **Mobile**: < 640px (sm)
- **Tablet**: 640px - 1024px (md/lg)
- **Desktop**: > 1024px (xl)

### Mobile Optimizations
- **Collapsible sections** for space efficiency
- **Touch-friendly buttons** with adequate tap targets
- **Simplified navigation** with bottom sheet modals
- **Progressive disclosure** of complex information

### Accessibility Features
- **Keyboard navigation** for all interactive elements
- **Screen reader support** with proper ARIA labels
- **High contrast mode** support
- **Reduced motion** respect for user preferences
- **Focus management** for modal dialogs

## Performance

### Optimization Strategies
- **Lazy loading** of heavy components
- **Virtual scrolling** for large lists
- **Image optimization** with Next.js Image component
- **Code splitting** by route and feature
- **Caching** of API responses

### Loading States
- **Skeleton screens** for perceived performance
- **Progressive loading** of content sections
- **Real-time updates** without full page refreshes
- **Background data fetching** for seamless UX

## Security

### Authentication & Authorization
- **Founder-only access** with role-based permissions
- **Project ownership validation**
- **Secure API endpoints** with proper authentication
- **CSRF protection** on state-changing operations

### Data Protection
- **Input validation** on all form submissions
- **XSS prevention** with proper sanitization
- **Secure file downloads** with temporary URLs
- **Audit logging** for all review actions

## Testing

### Component Testing
```bash
# Run component tests
npm run test:components

# Test with coverage
npm run test:coverage
```

### Integration Testing
```bash
# Run integration tests
npm run test:integration

# E2E testing
npm run test:e2e
```

### Manual Testing Checklist
- [ ] Project loading and error states
- [ ] Script upload and preview functionality
- [ ] Processing status updates
- [ ] Asset preview and download
- [ ] Approval workflow completion
- [ ] Mobile responsiveness
- [ ] Accessibility compliance

## Deployment

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Build Optimization
```bash
# Production build
npm run build

# Analyze bundle
npm run analyze

# Deploy to Vercel
vercel deploy --prod
```

## Monitoring

### Metrics to Track
- **Page load performance** (Core Web Vitals)
- **API response times** and error rates
- **User engagement** with review features
- **Conversion rates** (reviews to approvals)

### Error Tracking
- **Client-side errors** with error boundaries
- **API errors** with structured logging
- **User feedback** on system issues
- **Performance monitoring** with real user metrics

## Future Enhancements

### Planned Features
- **Real-time collaboration** with WebSocket integration
- **Advanced filtering** and search capabilities
- **AI-powered suggestions** for improvements
- **Integration** with external tools (Slack, Jira)
- **Mobile app** for on-the-go reviews

### Technical Improvements
- **GraphQL integration** for efficient data fetching
- **Offline support** with service workers
- **Advanced caching** with Redis
- **Microservices architecture** for scalability

## Support

For questions or issues with the Project Review System:

1. Check the [troubleshooting guide](./TROUBLESHOOTING.md)
2. Review the [API documentation](./API_DOCS.md)
3. File an issue in the project repository
4. Contact the development team

---

*Last updated: December 2024*