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
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image: string | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
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
      orders: {
        Row: {
          address: string
          created_at: string
          customer_name: string
          frame_color: string
          frame_type: string
          governorate: string
          id: string
          notes: string | null
          order_number: string | null
          packaging_fee: number
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
          notes?: string | null
          order_number?: string | null
          packaging_fee?: number
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
          notes?: string | null
          order_number?: string | null
          packaging_fee?: number
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
      posters: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          edit_settings: Json
          featured: boolean
          hidden: boolean
          id: string
          image_url: string
          original_url: string | null
          price: number | null
          sales_count: number
          seo_description: string | null
          seo_title: string | null
          sort_order: number
          tags: string[]
          title: string
          updated_at: string
          views_count: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          edit_settings?: Json
          featured?: boolean
          hidden?: boolean
          id?: string
          image_url: string
          original_url?: string | null
          price?: number | null
          sales_count?: number
          seo_description?: string | null
          seo_title?: string | null
          sort_order?: number
          tags?: string[]
          title?: string
          updated_at?: string
          views_count?: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          edit_settings?: Json
          featured?: boolean
          hidden?: boolean
          id?: string
          image_url?: string
          original_url?: string | null
          price?: number | null
          sales_count?: number
          seo_description?: string | null
          seo_title?: string | null
          sort_order?: number
          tags?: string[]
          title?: string
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
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
