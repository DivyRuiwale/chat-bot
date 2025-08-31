# app.py
# --- Core Imports ---
import uvicorn
import json
import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

# --- AI & Embeddings Imports ---
from sentence_transformers import SentenceTransformer, util
import torch

# --- FastAPI App Initialization ---
app = FastAPI()

# --- CORS Configuration ---
# This allows your frontend to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your frontend's domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- AI Model and In-Memory Storage ---

# 1. Load a powerful, lightweight sentence-transformer model that runs on your CPU.
model = SentenceTransformer('all-MiniLM-L6-v2')

# 2. In-memory storage for the knowledge base.
# In a real-world app, you might use a persistent vector database like ChromaDB or Pinecone.
knowledge_base: List[dict] = []
knowledge_base_embeddings: Optional[torch.Tensor] = None

# --- Helper Functions ---

def load_and_embed_initial_faqs():
    """Loads the default faqs.json and pre-computes their embeddings at startup."""
    global knowledge_base, knowledge_base_embeddings
    try:
        with open('faqs.json', 'r') as f:
            initial_faqs = json.load(f)
        
        knowledge_base.extend(initial_faqs)
        
        # Pre-compute embeddings for the questions from the JSON file
        questions = [item['question'] for item in knowledge_base]
        knowledge_base_embeddings = model.encode(questions, convert_to_tensor=True)
        print(f"✅ Loaded and embedded {len(knowledge_base)} initial FAQs.")

    except Exception as e:
        print(f"⚠️ Error loading initial FAQs: {e}")

# --- API Endpoints ---

@app.on_event("startup")
async def on_startup():
    """This function is called once when the FastAPI server starts."""
    load_and_embed_initial_faqs()

@app.post("/upload")
async def upload_faqs(file: UploadFile = File(...)):
    """
    Dynamically accepts a new FAQ file (.json or .csv), generates embeddings,
    and merges them into the existing knowledge base without a server restart.
    """
    global knowledge_base, knowledge_base_embeddings
    
    content = await file.read()
    filename = file.filename.lower()
    new_faqs = []

    try:
        # Parse the file based on its extension
        if filename.endswith(".json"):
            new_faqs = json.loads(content)
        elif filename.endswith(".csv"):
            df = pd.read_csv(pd.io.common.BytesIO(content))
            # Ensure the CSV has 'Question' and 'Answer' columns
            new_faqs = df.rename(columns={'Question': 'question', 'Answer': 'answer'}).to_dict(orient='records')
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use .json or .csv.")
        
        if not new_faqs:
            raise HTTPException(status_code=400, detail="No Q&A pairs found in the file.")
            
        # Generate embeddings ONLY for the new questions for efficiency
        new_questions = [item['question'] for item in new_faqs]
        new_embeddings = model.encode(new_questions, convert_to_tensor=True)
        
        # Merge new data with the existing knowledge base
        knowledge_base.extend(new_faqs)
        if knowledge_base_embeddings is not None:
            knowledge_base_embeddings = torch.cat((knowledge_base_embeddings, new_embeddings), dim=0)
        else:
            knowledge_base_embeddings = new_embeddings

        return {"message": f"Successfully added {len(new_faqs)} new FAQs from {file.filename}."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

class ChatQuery(BaseModel):
    query: str

@app.post("/chat")
async def chat(request: ChatQuery):
    """
    Handles user queries by performing a cosine similarity search against the knowledge base.
    """
    if knowledge_base_embeddings is None:
        raise HTTPException(status_code=400, detail="The bot is not yet trained. Please upload an FAQ file.")

    # 1. Convert the user's query into an embedding
    query_embedding = model.encode(request.query, convert_to_tensor=True)
    
    # 2. Compute cosine similarity scores between the query and all FAQ questions
    cosine_scores = util.cos_sim(query_embedding, knowledge_base_embeddings)[0]
    
    # 3. Find the index and score of the best match
    best_match_idx = torch.argmax(cosine_scores).item()
    best_match_score = cosine_scores[best_match_idx].item()
    
    # 4. Implement the strict similarity threshold
    SIMILARITY_THRESHOLD = 0.75
    
    if best_match_score > SIMILARITY_THRESHOLD:
        # If the match is confident enough, return the corresponding answer
        answer = knowledge_base[best_match_idx]['answer']
        return {"answer": answer}
    else:
        # Otherwise, return the "I don't know" response
        return {"answer": "Sorry, I couldn’t find an answer to that in the FAQs."}