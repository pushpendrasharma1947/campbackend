-- Add image_url column to items table
ALTER TABLE items
ADD COLUMN IF NOT EXISTS image_url TEXT;
