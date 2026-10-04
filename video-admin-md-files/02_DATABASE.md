# DATABASE DESIGN

Database sử dụng Supabase PostgreSQL.

## 1. profiles
- id uuid PRIMARY KEY REFERENCES auth.users(id)
- username text UNIQUE NOT NULL
- email text UNIQUE NOT NULL
- full_name text
- avatar_url text
- role text DEFAULT 'USER'
- created_at timestamptz DEFAULT now()
- updated_at timestamptz DEFAULT now()

Không lưu password trong bảng này.

## 2. video_categories
- id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- name text NOT NULL UNIQUE
- slug text NOT NULL UNIQUE
- description text
- created_at timestamptz DEFAULT now()

## 3. videos
- id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- title text NOT NULL
- slug text UNIQUE
- description text
- thumbnail_url text
- video_url text
- storage_path text
- category_id bigint REFERENCES video_categories(id)
- views bigint DEFAULT 0
- status text DEFAULT 'PUBLISHED'
- duration integer
- file_size bigint
- created_by uuid REFERENCES profiles(id)
- created_at timestamptz DEFAULT now()
- updated_at timestamptz DEFAULT now()

## 4. video_views
- id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- video_id bigint REFERENCES videos(id) ON DELETE CASCADE
- user_id uuid REFERENCES profiles(id)
- viewed_at timestamptz DEFAULT now()

## 5. site_settings
- id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- site_name text
- logo_url text
- created_at timestamptz DEFAULT now()
- updated_at timestamptz DEFAULT now()

## Relationships
profiles -> videos
video_categories -> videos
videos -> video_views
profiles -> video_views

## Indexes
Tạo index cho:
- videos.views
- videos.category_id
- videos.created_at
- video_views.video_id
- video_views.viewed_at
- profiles.role
