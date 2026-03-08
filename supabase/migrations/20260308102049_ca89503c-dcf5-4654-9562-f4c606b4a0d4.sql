CREATE TABLE public.word_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word text NOT NULL UNIQUE,
  image_url text NOT NULL,
  photographer_name text,
  photographer_url text,
  unsplash_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.word_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to word_images"
  ON public.word_images
  FOR ALL
  USING (true)
  WITH CHECK (true);