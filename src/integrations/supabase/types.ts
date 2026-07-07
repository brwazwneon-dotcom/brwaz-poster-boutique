export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_devices: {
        Row: {
          created_at: string
          fcm_token: string
          id: string
          label: string | null
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fcm_token: string
          id?: string
          label?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fcm_token?: string
          id?: string
          label?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_seo_logs: {
        Row: {
          admin_user_id: string | null
          category_id: string | null
          created_at: string
          error: string | null
          fields_updated: string[] | null
          id: string
          poster_id: string | null
          provider: string | null
          status: string
        }
        Insert: {
          admin_user_id?: string | null
          category_id?: string | null
          created_at?: string
          error?: string | null
          fields_updated?: string[] | null
          id?: string
          poster_id?: string | null
          provider?: string | null
          status: string
        }
        Update: {
          admin_user_id?: string | null
          category_id?: string | null
          created_at?: string
          error?: string | null
          fields_updated?: string[] | null
          id?: string
          poster_id?: string | null
          provider?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_seo_logs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_seo_logs_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_poster_events: {
        Row: {
          created_at: string
          duration_seconds: number | null
          event_type: string
          id: string
          metadata: Json | null
          poster_id: string | null
          session_id: string | null
          visitor_id: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          event_type: string
          id?: string
          metadata?: Json | null
          poster_id?: string | null
          session_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          event_type?: string
          id?: string
          metadata?: Json | null
          poster_id?: string | null
          session_id?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_poster_events_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_visits: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string
          device: string | null
          governorate: string | null
          id: string
          os: string | null
          path: string | null
          referrer: string | null
          session_id: string
          source: string | null
          user_agent: string | null
          visitor_id: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          device?: string | null
          governorate?: string | null
          id?: string
          os?: string | null
          path?: string | null
          referrer?: string | null
          session_id: string
          source?: string | null
          user_agent?: string | null
          visitor_id: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          device?: string | null
          governorate?: string | null
          id?: string
          os?: string | null
          path?: string | null
          referrer?: string | null
          session_id?: string
          source?: string | null
          user_agent?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      backups: {
        Row: {
          backup_type: string
          checksum: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_by_email: string | null
          encryption: string | null
          error_message: string | null
          id: string
          size_bytes: number | null
          status: string
          storage_manifest: Json | null
          storage_path: string | null
          table_counts: Json | null
          triggered_by: string
        }
        Insert: {
          backup_type: string
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          encryption?: string | null
          error_message?: string | null
          id?: string
          size_bytes?: number | null
          status?: string
          storage_manifest?: Json | null
          storage_path?: string | null
          table_counts?: Json | null
          triggered_by?: string
        }
        Update: {
          backup_type?: string
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          encryption?: string | null
          error_message?: string | null
          id?: string
          size_bytes?: number | null
          status?: string
          storage_manifest?: Json | null
          storage_path?: string | null
          table_counts?: Json | null
          triggered_by?: string
        }
        Relationships: []
      }
      before_after: {
        Row: {
          active: boolean
          after_url: string
          before_url: string
          created_at: string
          description: string | null
          id: string
          location: string
          sort_order: number
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          after_url: string
          before_url: string
          created_at?: string
          description?: string | null
          id?: string
          location?: string
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          after_url?: string
          before_url?: string
          created_at?: string
          description?: string | null
          id?: string
          location?: string
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      best_sellers: {
        Row: {
          badge_disabled: boolean
          created_at: string
          end_date: string | null
          featured: boolean
          hidden: boolean
          id: string
          pinned: boolean
          position: number
          poster_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          badge_disabled?: boolean
          created_at?: string
          end_date?: string | null
          featured?: boolean
          hidden?: boolean
          id?: string
          pinned?: boolean
          position?: number
          poster_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          badge_disabled?: boolean
          created_at?: string
          end_date?: string | null
          featured?: boolean
          hidden?: boolean
          id?: string
          pinned?: boolean
          position?: number
          poster_id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_sellers_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: true
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          featured: boolean
          hidden: boolean
          icon: string | null
          id: string
          image: string | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          featured?: boolean
          hidden?: boolean
          icon?: string | null
          id?: string
          image?: string | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          featured?: boolean
          hidden?: boolean
          icon?: string | null
          id?: string
          image?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_design_orders: {
        Row: {
          address: string
          created_at: string
          customer_name: string
          frame_color: string
          frame_type: string
          governorate: string
          id: string
          image_paths: string[]
          image_urls: string[]
          notes: string | null
          order_number: string | null
          phone: string
          quantity: number
          shipping_cost: number
          size: string
          status: string
          subtotal: number
          total_price: number
          unit_price: number
        }
        Insert: {
          address: string
          created_at?: string
          customer_name: string
          frame_color: string
          frame_type: string
          governorate: string
          id?: string
          image_paths?: string[]
          image_urls?: string[]
          notes?: string | null
          order_number?: string | null
          phone: string
          quantity?: number
          shipping_cost?: number
          size: string
          status?: string
          subtotal: number
          total_price: number
          unit_price: number
        }
        Update: {
          address?: string
          created_at?: string
          customer_name?: string
          frame_color?: string
          frame_type?: string
          governorate?: string
          id?: string
          image_paths?: string[]
          image_urls?: string[]
          notes?: string | null
          order_number?: string | null
          phone?: string
          quantity?: number
          shipping_cost?: number
          size?: string
          status?: string
          subtotal?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: []
      }
      hero_banners: {
        Row: {
          button_link: string | null
          button_text: string | null
          created_at: string
          enabled: boolean
          id: string
          image_url: string
          sort_order: number
          subtitle: string | null
          title: string | null
        }
        Insert: {
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          image_url: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
        }
        Update: {
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          image_url?: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
        }
        Relationships: []
      }
      highlights: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          image_url: string | null
          key: string
          link: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          image_url?: string | null
          key: string
          link?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          image_url?: string | null
          key?: string
          link?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_secrets: {
        Row: {
          firebase_service_account: Json | null
          id: number
          meta_capi_access_token: string | null
          updated_at: string
        }
        Insert: {
          firebase_service_account?: Json | null
          id?: number
          meta_capi_access_token?: string | null
          updated_at?: string
        }
        Update: {
          firebase_service_account?: Json | null
          id?: number
          meta_capi_access_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          body: string | null
          created_at: string
          error: string | null
          failed_count: number
          id: string
          payload: Json | null
          sent_count: number
          status: string | null
          title: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          error?: string | null
          failed_count?: number
          id?: string
          payload?: Json | null
          sent_count?: number
          status?: string | null
          title?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          error?: string | null
          failed_count?: number
          id?: string
          payload?: Json | null
          sent_count?: number
          status?: string | null
          title?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: string
          created_at: string
          customer_name: string
          frame_color: string
          frame_type: string
          governorate: string
          id: string
          is_test: boolean
          notes: string | null
          order_number: string | null
          packaging_fee: number
          payment_method: string
          payment_notes: string | null
          payment_reference: string | null
          payment_screenshot: string | null
          payment_status: string
          payment_verified_at: string | null
          phone: string
          poster_image: string | null
          poster_title: string | null
          quantity: number
          selected_poster: string | null
          shipping_cost: number
          size: string
          status: string
          subtotal: number | null
          total_price: number
        }
        Insert: {
          address: string
          created_at?: string
          customer_name: string
          frame_color: string
          frame_type: string
          governorate: string
          id?: string
          is_test?: boolean
          notes?: string | null
          order_number?: string | null
          packaging_fee?: number
          payment_method?: string
          payment_notes?: string | null
          payment_reference?: string | null
          payment_screenshot?: string | null
          payment_status?: string
          payment_verified_at?: string | null
          phone: string
          poster_image?: string | null
          poster_title?: string | null
          quantity?: number
          selected_poster?: string | null
          shipping_cost?: number
          size: string
          status?: string
          subtotal?: number | null
          total_price: number
        }
        Update: {
          address?: string
          created_at?: string
          customer_name?: string
          frame_color?: string
          frame_type?: string
          governorate?: string
          id?: string
          is_test?: boolean
          notes?: string | null
          order_number?: string | null
          packaging_fee?: number
          payment_method?: string
          payment_notes?: string | null
          payment_reference?: string | null
          payment_screenshot?: string | null
          payment_status?: string
          payment_verified_at?: string | null
          phone?: string
          poster_image?: string | null
          poster_title?: string | null
          quantity?: number
          selected_poster?: string | null
          shipping_cost?: number
          size?: string
          status?: string
          subtotal?: number | null
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_selected_poster_fkey"
            columns: ["selected_poster"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_4x6_orders: {
        Row: {
          address: string | null
          created_at: string
          customer_name: string
          enhanced_paths: string[]
          governorate: string | null
          id: string
          notes: string | null
          order_number: string | null
          original_paths: string[]
          package_key: string
          phone: string
          photo_count: number
          selected_versions: Json
          status: string
          suit_paths: string[]
          total_price: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_name: string
          enhanced_paths?: string[]
          governorate?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          original_paths?: string[]
          package_key: string
          phone: string
          photo_count?: number
          selected_versions?: Json
          status?: string
          suit_paths?: string[]
          total_price?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_name?: string
          enhanced_paths?: string[]
          governorate?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          original_paths?: string[]
          package_key?: string
          phone?: string
          photo_count?: number
          selected_versions?: Json
          status?: string
          suit_paths?: string[]
          total_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      photo_orders: {
        Row: {
          address: string
          created_at: string
          customer_name: string
          governorate: string
          id: string
          order_number: string | null
          phone: string
          photo_urls: Json
          quantity: number
          shipping_cost: number
          size: string
          status: string
          total_price: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          customer_name: string
          governorate: string
          id?: string
          order_number?: string | null
          phone: string
          photo_urls?: Json
          quantity: number
          shipping_cost?: number
          size: string
          status?: string
          total_price: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          customer_name?: string
          governorate?: string
          id?: string
          order_number?: string | null
          phone?: string
          photo_urls?: Json
          quantity?: number
          shipping_cost?: number
          size?: string
          status?: string
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      poster_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_default: boolean
          kind: string | null
          label: string | null
          poster_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_default?: boolean
          kind?: string | null
          label?: string | null
          poster_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_default?: boolean
          kind?: string | null
          label?: string | null
          poster_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "poster_images_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      posters: {
        Row: {
          ai_confidence: number | null
          alt_text: string | null
          badge: string | null
          cart_adds_count: number
          category_id: string | null
          colors: string[] | null
          created_at: string
          description: string | null
          edit_settings: Json
          featured: boolean
          hashtags: string[] | null
          hidden: boolean
          id: string
          image_url: string
          last_viewed_at: string | null
          orientation: string | null
          original_url: string | null
          price: number | null
          sales_count: number
          seo_description: string | null
          seo_title: string | null
          slug: string | null
          sort_order: number
          tags: string[]
          title: string
          total_view_seconds: number
          unique_views_count: number
          updated_at: string
          views_count: number
        }
        Insert: {
          ai_confidence?: number | null
          alt_text?: string | null
          badge?: string | null
          cart_adds_count?: number
          category_id?: string | null
          colors?: string[] | null
          created_at?: string
          description?: string | null
          edit_settings?: Json
          featured?: boolean
          hashtags?: string[] | null
          hidden?: boolean
          id?: string
          image_url: string
          last_viewed_at?: string | null
          orientation?: string | null
          original_url?: string | null
          price?: number | null
          sales_count?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string | null
          sort_order?: number
          tags?: string[]
          title?: string
          total_view_seconds?: number
          unique_views_count?: number
          updated_at?: string
          views_count?: number
        }
        Update: {
          ai_confidence?: number | null
          alt_text?: string | null
          badge?: string | null
          cart_adds_count?: number
          category_id?: string | null
          colors?: string[] | null
          created_at?: string
          description?: string | null
          edit_settings?: Json
          featured?: boolean
          hashtags?: string[] | null
          hidden?: boolean
          id?: string
          image_url?: string
          last_viewed_at?: string | null
          orientation?: string | null
          original_url?: string | null
          price?: number | null
          sales_count?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string | null
          sort_order?: number
          tags?: string[]
          title?: string
          total_view_seconds?: number
          unique_views_count?: number
          updated_at?: string
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "posters_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      recently_viewed: {
        Row: {
          poster_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          poster_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          poster_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recently_viewed_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          approved: boolean
          created_at: string
          customer_name: string
          featured: boolean
          governorate: string | null
          id: string
          photo_url: string | null
          poster_id: string | null
          rating: number
          review_text: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          customer_name: string
          featured?: boolean
          governorate?: string | null
          id?: string
          photo_url?: string | null
          poster_id?: string | null
          rating: number
          review_text?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          customer_name?: string
          featured?: boolean
          governorate?: string | null
          id?: string
          photo_url?: string | null
          poster_id?: string | null
          rating?: number
          review_text?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          created_at: string
          id: string
          query: string
          results_count: number
          visitor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          query: string
          results_count?: number
          visitor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          results_count?: number
          visitor_id?: string | null
        }
        Relationships: []
      }
      sets: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          featured: boolean
          frames_count: number
          id: string
          image_url: string | null
          name: string
          old_price: number | null
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          featured?: boolean
          frames_count?: number
          id?: string
          image_url?: string | null
          name: string
          old_price?: number | null
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          featured?: boolean
          frames_count?: number
          id?: string
          image_url?: string | null
          name?: string
          old_price?: number | null
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      slider_images: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          image_url: string
          link_url: string | null
          sort_order: number
          title: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          image_url: string
          link_url?: string | null
          sort_order?: number
          title?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          image_url?: string
          link_url?: string | null
          sort_order?: number
          title?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitor_cart_events: {
        Row: {
          created_at: string
          event: string
          frame_type: string | null
          id: string
          poster_id: string | null
          qty: number | null
          size: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          event: string
          frame_type?: string | null
          id?: string
          poster_id?: string | null
          qty?: number | null
          size?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          event?: string
          frame_type?: string | null
          id?: string
          poster_id?: string | null
          qty?: number | null
          size?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_cart_events_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_profiles: {
        Row: {
          city: string | null
          country: string | null
          device: string | null
          first_seen: string
          governorate: string | null
          interests: Json
          last_seen: string
          phone: string | null
          updated_at: string
          visitor_id: string
          visits_count: number
        }
        Insert: {
          city?: string | null
          country?: string | null
          device?: string | null
          first_seen?: string
          governorate?: string | null
          interests?: Json
          last_seen?: string
          phone?: string | null
          updated_at?: string
          visitor_id: string
          visits_count?: number
        }
        Update: {
          city?: string | null
          country?: string | null
          device?: string | null
          first_seen?: string
          governorate?: string | null
          interests?: Json
          last_seen?: string
          phone?: string | null
          updated_at?: string
          visitor_id?: string
          visits_count?: number
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          poster_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          poster_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          poster_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      real_orders: {
        Row: {
          address: string | null
          created_at: string | null
          customer_name: string | null
          frame_color: string | null
          frame_type: string | null
          governorate: string | null
          id: string | null
          is_test: boolean | null
          notes: string | null
          order_number: string | null
          packaging_fee: number | null
          payment_method: string | null
          payment_notes: string | null
          payment_reference: string | null
          payment_screenshot: string | null
          payment_status: string | null
          payment_verified_at: string | null
          phone: string | null
          poster_image: string | null
          poster_title: string | null
          quantity: number | null
          selected_poster: string | null
          shipping_cost: number | null
          size: string | null
          status: string | null
          subtotal: number | null
          total_price: number | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          customer_name?: string | null
          frame_color?: string | null
          frame_type?: string | null
          governorate?: string | null
          id?: string | null
          is_test?: boolean | null
          notes?: string | null
          order_number?: string | null
          packaging_fee?: number | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_reference?: string | null
          payment_screenshot?: string | null
          payment_status?: string | null
          payment_verified_at?: string | null
          phone?: string | null
          poster_image?: string | null
          poster_title?: string | null
          quantity?: number | null
          selected_poster?: string | null
          shipping_cost?: number | null
          size?: string | null
          status?: string | null
          subtotal?: number | null
          total_price?: number | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          customer_name?: string | null
          frame_color?: string | null
          frame_type?: string | null
          governorate?: string | null
          id?: string | null
          is_test?: boolean | null
          notes?: string | null
          order_number?: string | null
          packaging_fee?: number | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_reference?: string | null
          payment_screenshot?: string | null
          payment_status?: string | null
          payment_verified_at?: string | null
          phone?: string | null
          poster_image?: string | null
          poster_title?: string | null
          quantity?: number | null
          selected_poster?: string | null
          shipping_cost?: number | null
          size?: string | null
          status?: string | null
          subtotal?: number | null
          total_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_selected_poster_fkey"
            columns: ["selected_poster"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_poster_view_seconds: {
        Args: { p_id: string; p_seconds: number }
        Returns: undefined
      }
      admin_behavior_dashboard: { Args: never; Returns: Json }
      admin_clear_anonymous_behavior: {
        Args: { _older_than_days?: number }
        Returns: number
      }
      admin_customer_profile: { Args: { _phone: string }; Returns: Json }
      admin_dashboard: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      admin_live_visitors: { Args: never; Returns: number }
      admin_realtime_analytics: { Args: { p_period?: string }; Returns: Json }
      admin_reset_recommendation_engine: { Args: never; Returns: undefined }
      admin_storage_manifest: { Args: never; Returns: Json }
      get_recommendations: {
        Args: { _limit?: number; _visitor_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_poster_cart_adds: {
        Args: { p_ids: string[]; p_qty: number }
        Returns: undefined
      }
      increment_poster_sales: {
        Args: { p_ids: string[]; p_qty: number }
        Returns: undefined
      }
      increment_poster_unique_views: {
        Args: { p_id: string }
        Returns: undefined
      }
      increment_poster_views: { Args: { p_id: string }; Returns: undefined }
      merge_visitor_to_phone: {
        Args: { _phone: string; _visitor_id: string }
        Returns: undefined
      }
      posters_tags_text: { Args: { p_tags: string[] }; Returns: string }
      score_visitor_interest: {
        Args: {
          _delta?: number
          _key: string
          _kind: string
          _visitor_id: string
        }
        Returns: undefined
      }
      search_posters: {
        Args: { lim?: number; q: string }
        Returns: {
          badge: string
          category_id: string
          category_name: string
          category_slug: string
          id: string
          image_url: string
          score: number
          tags: string[]
          title: string
        }[]
      }
      trending_searches: {
        Args: { lim?: number }
        Returns: {
          count: number
          query: string
        }[]
      }
      upsert_visitor_profile: {
        Args: {
          _city?: string
          _country?: string
          _device?: string
          _governorate?: string
          _visitor_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
