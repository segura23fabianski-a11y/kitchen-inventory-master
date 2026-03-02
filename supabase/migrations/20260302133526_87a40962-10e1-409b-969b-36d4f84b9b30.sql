
-- 1. Create product_codes table
CREATE TABLE public.product_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, code)
);

-- Enable RLS
ALTER TABLE public.product_codes ENABLE ROW LEVEL SECURITY;

-- RLS: All tenant users can view codes
CREATE POLICY "Active tenant users can view product codes"
  ON public.product_codes FOR SELECT
  TO authenticated
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- RLS: Admin and bodega can manage codes
CREATE POLICY "Admin and bodega can manage product codes"
  ON public.product_codes FOR ALL
  TO authenticated
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- 2. Add image_url to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 3. Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

-- Storage RLS: Anyone can view product images (public bucket)
CREATE POLICY "Anyone can view product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Storage RLS: Authenticated users with roles can upload
CREATE POLICY "Authenticated users can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images');

-- Storage RLS: Authenticated users can update their uploads
CREATE POLICY "Authenticated users can update product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-images');

-- Storage RLS: Authenticated users can delete
CREATE POLICY "Authenticated users can delete product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images');
