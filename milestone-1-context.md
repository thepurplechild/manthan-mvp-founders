Comprehensive Task List for Manthan MVP Evolution
Phase 1: Fortify the Foundation & Implement Core Security
This phase upgrades the existing starter kit to reflect the project's unique strategic needs, focusing on trust and role-based access.
• Task 1.1: Database Schema Expansion and Finalization
    ◦ Objective: Evolve the database from the foundational schema to the full, data-capture-ready model required for the "Founder's Command Center". This is crucial for collecting the data needed for the future "Success Prediction Score".
    ◦ Action: Write and execute SQL migration scripts in Supabase to add the platform_mandates and deal_pipeline tables. Ensure all columns specified in the blueprint (e.g., tags, source, feedback_notes) are included to begin capturing proprietary market intelligence immediately.
• Task 1.2: Implement Advanced Role-Based Access Control (RBAC)
    ◦ Objective: Secure the application by ensuring founders and creators have distinct permissions, making the "Founder's Command Center" a truly private tool.
    ◦ Action: In the Supabase SQL Editor, write and apply comprehensive Row-Level Security (RLS) policies for all tables.
        ▪ For projects, script_uploads, and generated_assets: Creators can only access rows where owner_id matches their own ID. Founders (where role = 'founder') must have full CRUD access to all rows.
        ▪ For platform_mandates and deal_pipeline: Restrict all access (SELECT, INSERT, UPDATE, DELETE) exclusively to users with the 'founder' role.
• Task 1.3: Develop and Integrate the "Creator's Bill of Rights" Consent Modal
    ◦ Objective: Build trust from the very first interaction by transforming the legal requirement of consent under India's DPDP Act, 2023, into a powerful, creator-first feature. This directly addresses consumer concerns about data protection.
    ◦ Action: Create a new React component for a modal window that appears during the sign-up process. This modal will display the clear, plain-language statements outlined in the blueprint. The "Sign Up" button must remain disabled until the user has actively checked boxes for each statement, ensuring explicit, informed consent.

--------------------------------------------------------------------------------
Phase 2: Build the Creator Intelligence Engine (Packaging Agent)
This phase focuses on developing the core AI value proposition: transforming raw scripts into market-ready pitch packages.
• Task 2.1: Implement the Asynchronous Backend API for the Packaging Agent
    ◦ Objective: Build the Python serverless function that will serve as the core of the AI engine, using a prompt-chaining approach for reliability and quality.
    ◦ Action: Create the Python serverless function on Vercel at /api/projects/run-packaging-agent. This function will be triggered by the finalize-upload endpoint and should:
        1. Receive a projectId in its payload.
        2. Use the Supabase Python client to download the corresponding script from Supabase Storage.
        3. Implement the full prompt chain from the blueprint:
            • Step 1 (Pre-processing): Parse the script text.
            • Step 2 (Extraction): Call the Claude 3 Opus API to extract logline, synopsis, themes, and characters into a JSON object. Store this structured data in the projects table.
            • Step 3 (Character Bible): Loop through main characters and generate detailed bible entries. Store this in the character_breakdowns JSONB column.
            • Step 4 & 5 (Adaptation & Content Generation): This is the most critical step. The prompt must be dynamically enriched with data from the new platform_mandates table. The function should query this table for relevant mandates (e.g., matching genre tags) and insert them into the prompt to generate a highly tailored series outline and pitch deck content.
            • Step 6 (Assembly): Use a Python library like python-docx to assemble the generated text into a formatted .docx file.
        4. Upload the final document to Supabase Storage and create a corresponding entry in the generated_assets table.

--------------------------------------------------------------------------------
Phase 3: Construct the Founder's Command Center
This is the "real" MVP—the internal tool that makes the "human-in-the-loop" model efficient, scalable, and capable of capturing the data that will form the platform's long-term moat.
• Task 3.1: Build the Founder-Exclusive Frontend Routes
    ◦ Objective: Create the secure user interface for the founder to manage the entire marketplace.
    ◦ Action:
        1. Create a new route group in Next.js: app/(founder)/....
        2. Update middleware.ts to protect this route group. The logic must now check not only for an authenticated session but also make a server-side call to the profiles table to verify that the user's role is 'founder'. Redirect any non-founder user.
• Task 3.2: Develop the Platform Mandates Management Interface
    ◦ Objective: Create the crucial interface for logging the proprietary market intelligence that powers the AI's hyper-verticalization.
    ◦ Action: Create a page at app/(founder)/mandates/page.tsx. Build a full CRUD interface for the platform_mandates table. This should include a form to add new mandates (with fields for platform name, description, tags, and source) and a table to view, edit, and delete existing entries. This directly supports the founder's market intelligence gathering workflow.
• Task 3.3: Develop the Deal Pipeline Management Interface
    ◦ Objective: Create the tool for managing deal flow, which is essential for tracking progress towards the MVP's success metric of 3-5 closed deals and capturing outcome data for the future ML model.
    ◦ Action: On the dynamic project review page (app/(founder)/projects/[id]/page.tsx), add a new section for the deal_pipeline. This interface should allow the founder to:
        ▪ Log a new outreach effort (e.g., "Pitched to Netflix India").
        ▪ Update the status of each outreach (introduced, passed, deal_closed).
        ▪ Record detailed feedback from buyers in the feedback_notes text field.

--------------------------------------------------------------------------------
Phase 4: Data Strategy Activation and Future-Proofing
This phase prepares the platform for its evolution into a predictive intelligence engine.
• Task 4.1: Integrate Indic Language and Culture Datasets
    ◦ Objective: Begin the process of creating a truly "Made for India" AI by sourcing relevant cultural and linguistic data to inform future fine-tuning efforts. This addresses the "hyper-verticalization" strategy and taps into the vast diversity of Indian cinema and mythology.
    ◦ Action:
        1. Dataset Sourcing: Begin programmatic exploration and downloading of key open-source Indic datasets identified in the "Manthan OS" blueprint, such as those from AI4Bharat (e.g., IndicCorpora, IndicWav2Vec).
        2. Cultural Data Curation: Scrape and structure data from sources like the IGNCA's digital library and the Open Government Data (OGD) Platform India to build a supplementary corpus on Indian mythology, folklore, and cultural narratives. This will be invaluable for training the AI to generate content with authentic cultural resonance.
        3. Data Storage: Create a dedicated, private bucket in Supabase Storage or an alternative cloud storage solution to house this curated data for future model fine-tuning.
• Task 4.2: Implement the Heuristic "Manthan Score" Model
    ◦ Objective: Introduce the first version of the "Success Prediction Score" as a founder-facing tool to aid in curation and provide immediate analytical value.
    ◦ Action:
        1. Add new nullable columns to the projects table in Supabase: story_strength_score (int), market_fit_score (int), creator_track_record_score (int), budget_feasibility_score (int).
        2. On the founder's project review page, create a simple form for the founder to input these scores manually for each project.
        3. Display a calculated "Manthan Score" on the founder's dashboard using the weighted average logic defined in the blueprint. This score will serve as a vital data point for prioritizing projects and will be the foundation for the future ML-driven model