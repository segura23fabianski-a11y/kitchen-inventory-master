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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: string
          key: string
          restaurant_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          restaurant_id: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          restaurant_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          can_rollback: boolean
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          performed_by: string
          restaurant_id: string
          rollback_applied: boolean
          rollback_of_event_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          can_rollback?: boolean
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          performed_by: string
          restaurant_id: string
          rollback_applied?: boolean
          rollback_of_event_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          can_rollback?: boolean
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          performed_by?: string
          restaurant_id?: string
          rollback_applied?: boolean
          rollback_of_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_rollback_of_event_id_fkey"
            columns: ["rollback_of_event_id"]
            isOneToOne: false
            referencedRelation: "audit_events"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_inventory_movements_20260311: {
        Row: {
          created_at: string | null
          evidence_url: string | null
          id: string | null
          loss_value: number | null
          movement_date: string | null
          notes: string | null
          product_id: string | null
          quantity: number | null
          recipe_id: string | null
          restaurant_id: string | null
          service_id: string | null
          total_cost: number | null
          type: string | null
          unit_cost: number | null
          user_id: string | null
          waste_reason: string | null
        }
        Insert: {
          created_at?: string | null
          evidence_url?: string | null
          id?: string | null
          loss_value?: number | null
          movement_date?: string | null
          notes?: string | null
          product_id?: string | null
          quantity?: number | null
          recipe_id?: string | null
          restaurant_id?: string | null
          service_id?: string | null
          total_cost?: number | null
          type?: string | null
          unit_cost?: number | null
          user_id?: string | null
          waste_reason?: string | null
        }
        Update: {
          created_at?: string | null
          evidence_url?: string | null
          id?: string | null
          loss_value?: number | null
          movement_date?: string | null
          notes?: string | null
          product_id?: string | null
          quantity?: number | null
          recipe_id?: string | null
          restaurant_id?: string | null
          service_id?: string | null
          total_cost?: number | null
          type?: string | null
          unit_cost?: number | null
          user_id?: string | null
          waste_reason?: string | null
        }
        Relationships: []
      }
      backup_products_20260311: {
        Row: {
          average_cost: number | null
          barcode: string | null
          category_id: string | null
          created_at: string | null
          current_stock: number | null
          daily_consumption: number | null
          id: string | null
          image_url: string | null
          last_unit_cost: number | null
          min_stock: number | null
          name: string | null
          reorder_mode: string | null
          restaurant_id: string | null
          target_days_of_stock: number | null
          unit: string | null
          updated_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          average_cost?: number | null
          barcode?: string | null
          category_id?: string | null
          created_at?: string | null
          current_stock?: number | null
          daily_consumption?: number | null
          id?: string | null
          image_url?: string | null
          last_unit_cost?: number | null
          min_stock?: number | null
          name?: string | null
          reorder_mode?: string | null
          restaurant_id?: string | null
          target_days_of_stock?: number | null
          unit?: string | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          average_cost?: number | null
          barcode?: string | null
          category_id?: string | null
          created_at?: string | null
          current_stock?: number | null
          daily_consumption?: number | null
          id?: string | null
          image_url?: string | null
          last_unit_cost?: number | null
          min_stock?: number | null
          name?: string | null
          reorder_mode?: string | null
          restaurant_id?: string | null
          target_days_of_stock?: number | null
          unit?: string | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: []
      }
      branding_settings: {
        Row: {
          accent_color: string | null
          app_name: string | null
          created_at: string
          favicon_url: string | null
          id: string
          login_background_url: string | null
          logo_small_url: string | null
          logo_url: string | null
          primary_color: string | null
          restaurant_id: string
          secondary_color: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          app_name?: string | null
          created_at?: string
          favicon_url?: string | null
          id?: string
          login_background_url?: string | null
          logo_small_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          restaurant_id: string
          secondary_color?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          app_name?: string | null
          created_at?: string
          favicon_url?: string | null
          id?: string
          login_background_url?: string | null
          logo_small_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          restaurant_id?: string
          secondary_color?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branding_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_execution_items: {
        Row: {
          actual_quantity: number | null
          component_name: string
          cost_source: string
          created_at: string
          execution_id: string
          id: string
          is_recipe_component: boolean
          line_cost: number
          product_id: string
          production_run_id: string | null
          quantity: number
          selected_recipe_id: string | null
          theoretical_quantity: number | null
          unit_cost: number
        }
        Insert: {
          actual_quantity?: number | null
          component_name: string
          cost_source?: string
          created_at?: string
          execution_id: string
          id?: string
          is_recipe_component?: boolean
          line_cost?: number
          product_id: string
          production_run_id?: string | null
          quantity: number
          selected_recipe_id?: string | null
          theoretical_quantity?: number | null
          unit_cost?: number
        }
        Update: {
          actual_quantity?: number | null
          component_name?: string
          cost_source?: string
          created_at?: string
          execution_id?: string
          id?: string
          is_recipe_component?: boolean
          line_cost?: number
          product_id?: string
          production_run_id?: string | null
          quantity?: number
          selected_recipe_id?: string | null
          theoretical_quantity?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "combo_execution_items_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "combo_execution_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_execution_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_execution_items_production_run_id_fkey"
            columns: ["production_run_id"]
            isOneToOne: false
            referencedRelation: "recipe_production_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_execution_items_selected_recipe_id_fkey"
            columns: ["selected_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_execution_logs: {
        Row: {
          created_at: string
          executed_at: string
          executed_by: string
          id: string
          notes: string | null
          recipe_id: string
          restaurant_id: string
          servings: number
          total_cost: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          executed_at?: string
          executed_by: string
          id?: string
          notes?: string | null
          recipe_id: string
          restaurant_id: string
          servings: number
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          executed_at?: string
          executed_by?: string
          id?: string
          notes?: string | null
          recipe_id?: string
          restaurant_id?: string
          servings?: number
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "combo_execution_logs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_execution_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_rates: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          includes_breakfast: boolean
          includes_housekeeping: boolean
          includes_laundry: boolean
          notes: string | null
          rate_per_night: number
          restaurant_id: string
          room_type_id: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          includes_breakfast?: boolean
          includes_housekeeping?: boolean
          includes_laundry?: boolean
          notes?: string | null
          rate_per_night?: number
          restaurant_id: string
          room_type_id: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          includes_breakfast?: boolean
          includes_housekeeping?: boolean
          includes_laundry?: boolean
          notes?: string | null
          rate_per_night?: number
          restaurant_id?: string
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_rates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hotel_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_rates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_rates_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_signatures: {
        Row: {
          created_at: string
          document_photo_url: string | null
          guest_id: string
          id: string
          restaurant_id: string
          signature_url: string | null
          stay_id: string
        }
        Insert: {
          created_at?: string
          document_photo_url?: string | null
          guest_id: string
          id?: string
          restaurant_id: string
          signature_url?: string | null
          stay_id: string
        }
        Update: {
          created_at?: string
          document_photo_url?: string | null
          guest_id?: string
          id?: string
          restaurant_id?: string
          signature_url?: string | null
          stay_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_signatures_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "hotel_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_signatures_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_signatures_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_companies: {
        Row: {
          active: boolean
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          nit: string | null
          phone: string | null
          restaurant_id: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          nit?: string | null
          phone?: string | null
          restaurant_id: string
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          nit?: string | null
          phone?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_companies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_guests: {
        Row: {
          birth_date: string | null
          created_at: string
          destination_city: string | null
          destination_country: string | null
          document_number: string
          document_type: string
          email: string | null
          first_name: string
          gender: string | null
          id: string
          last_name: string
          nationality: string | null
          origin_city: string | null
          origin_country: string | null
          phone: string | null
          profession: string | null
          restaurant_id: string
          travel_reason: string | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          destination_city?: string | null
          destination_country?: string | null
          document_number: string
          document_type?: string
          email?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          nationality?: string | null
          origin_city?: string | null
          origin_country?: string | null
          phone?: string | null
          profession?: string | null
          restaurant_id: string
          travel_reason?: string | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          destination_city?: string | null
          destination_country?: string | null
          document_number?: string
          document_type?: string
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          nationality?: string | null
          origin_city?: string | null
          origin_country?: string | null
          phone?: string | null
          profession?: string | null
          restaurant_id?: string
          travel_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_guests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      housekeeping_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          priority: string | null
          restaurant_id: string
          room_id: string
          status: string
          stay_id: string | null
          task_type: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          priority?: string | null
          restaurant_id: string
          room_id: string
          status?: string
          stay_id?: string | null
          task_type?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          priority?: string | null
          restaurant_id?: string
          room_id?: string
          status?: string
          stay_id?: string | null
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_tasks_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          evidence_url: string | null
          id: string
          loss_value: number | null
          movement_date: string
          notes: string | null
          product_id: string
          quantity: number
          recipe_id: string | null
          restaurant_id: string
          service_id: string | null
          total_cost: number
          type: string
          unit_cost: number
          user_id: string
          waste_reason: string | null
        }
        Insert: {
          created_at?: string
          evidence_url?: string | null
          id?: string
          loss_value?: number | null
          movement_date?: string
          notes?: string | null
          product_id: string
          quantity: number
          recipe_id?: string | null
          restaurant_id: string
          service_id?: string | null
          total_cost?: number
          type: string
          unit_cost?: number
          user_id: string
          waste_reason?: string | null
        }
        Update: {
          created_at?: string
          evidence_url?: string | null
          id?: string
          loss_value?: number | null
          movement_date?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          recipe_id?: string | null
          restaurant_id?: string
          service_id?: string | null
          total_cost?: number
          type?: string
          unit_cost?: number
          user_id?: string
          waste_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "operational_services"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_components: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_components_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_service_items: {
        Row: {
          component_id: string
          created_at: string
          id: string
          meal_plan_service_id: string
          recipe_id: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          component_id: string
          created_at?: string
          id?: string
          meal_plan_service_id: string
          recipe_id: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          component_id?: string
          created_at?: string
          id?: string
          meal_plan_service_id?: string
          recipe_id?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_service_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "meal_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_service_items_meal_plan_service_id_fkey"
            columns: ["meal_plan_service_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_service_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_service_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_services: {
        Row: {
          created_at: string
          id: string
          meal_plan_id: string
          projected_servings: number
          restaurant_id: string
          service_date: string
          service_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          meal_plan_id: string
          projected_servings?: number
          restaurant_id: string
          service_date: string
          service_type: string
        }
        Update: {
          created_at?: string
          id?: string
          meal_plan_id?: string
          projected_servings?: number
          restaurant_id?: string
          service_date?: string
          service_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_services_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_services_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          created_by: string
          end_date: string
          id: string
          name: string
          restaurant_id: string
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          end_date: string
          id?: string
          name: string
          restaurant_id: string
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          end_date?: string
          id?: string
          name?: string
          restaurant_id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_services: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          restaurant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          restaurant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_services_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_count_items: {
        Row: {
          count_id: string
          counted_stock: number | null
          created_at: string
          difference: number | null
          id: string
          notes: string | null
          product_id: string
          system_stock: number
        }
        Insert: {
          count_id: string
          counted_stock?: number | null
          created_at?: string
          difference?: number | null
          id?: string
          notes?: string | null
          product_id: string
          system_stock?: number
        }
        Update: {
          count_id?: string
          counted_stock?: number | null
          created_at?: string
          difference?: number | null
          id?: string
          notes?: string | null
          product_id?: string
          system_stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "physical_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "physical_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_counts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category_id: string | null
          count_date: string
          created_at: string
          created_by: string
          id: string
          name: string
          notes: string | null
          restaurant_id: string
          status: string
          warehouse_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          count_date?: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          notes?: string | null
          restaurant_id: string
          status?: string
          warehouse_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          count_date?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          notes?: string | null
          restaurant_id?: string
          status?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "physical_counts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_counts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_codes: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          product_id: string
          restaurant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          product_id: string
          restaurant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          product_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_codes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_operational_services: {
        Row: {
          created_at: string
          id: string
          product_id: string
          restaurant_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          restaurant_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          restaurant_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_operational_services_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_operational_services_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_operational_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "operational_services"
            referencedColumns: ["id"]
          },
        ]
      }
      product_suppliers: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          last_unit_cost: number | null
          minimum_order_qty: number | null
          product_id: string
          purchase_unit: string | null
          restaurant_id: string
          supplier_id: string
          supplier_product_code: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          last_unit_cost?: number | null
          minimum_order_qty?: number | null
          product_id: string
          purchase_unit?: string | null
          restaurant_id: string
          supplier_id: string
          supplier_product_code?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          last_unit_cost?: number | null
          minimum_order_qty?: number | null
          product_id?: string
          purchase_unit?: string | null
          restaurant_id?: string
          supplier_id?: string
          supplier_product_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_suppliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suppliers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          average_cost: number
          barcode: string | null
          category_id: string | null
          created_at: string
          current_stock: number
          daily_consumption: number | null
          id: string
          image_url: string | null
          last_unit_cost: number | null
          min_stock: number
          name: string
          reorder_mode: string
          restaurant_id: string
          target_days_of_stock: number
          unit: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          average_cost?: number
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          current_stock?: number
          daily_consumption?: number | null
          id?: string
          image_url?: string | null
          last_unit_cost?: number | null
          min_stock?: number
          name: string
          reorder_mode?: string
          restaurant_id: string
          target_days_of_stock?: number
          unit?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          average_cost?: number
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          current_stock?: number
          daily_consumption?: number | null
          id?: string
          image_url?: string | null
          last_unit_cost?: number | null
          min_stock?: number
          name?: string
          reorder_mode?: string
          restaurant_id?: string
          target_days_of_stock?: number
          unit?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved_at: string | null
          can_backdate_inventory: boolean
          created_at: string
          full_name: string
          id: string
          restaurant_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          can_backdate_inventory?: boolean
          created_at?: string
          full_name?: string
          id?: string
          restaurant_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          can_backdate_inventory?: boolean
          created_at?: string
          full_name?: string
          id?: string
          restaurant_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoice_items: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          line_total: number
          product_id: string
          quantity: number
          restaurant_id: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          line_total?: number
          product_id: string
          quantity: number
          restaurant_id: string
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          line_total?: number
          product_id?: string
          quantity?: number
          restaurant_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          created_at: string
          created_by: string
          id: string
          invoice_date: string
          invoice_number: string
          posted_at: string | null
          posted_by: string | null
          received_date: string
          restaurant_id: string
          status: string
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          invoice_date: string
          invoice_number: string
          posted_at?: string | null
          posted_by?: string | null
          received_date?: string
          restaurant_id: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          posted_at?: string | null
          posted_by?: string | null
          received_date?: string
          restaurant_id?: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          restaurant_id: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_order_id: string
          quantity: number
          restaurant_id: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          restaurant_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_pdf_settings: {
        Row: {
          approved_by_name: string | null
          company_address: string | null
          company_email: string | null
          company_name: string | null
          company_nit: string | null
          company_phone: string | null
          created_at: string | null
          document_code: string | null
          footer_contact_text: string | null
          format_date: string | null
          id: string
          logo_url: string | null
          observations_default: string | null
          primary_color: string | null
          restaurant_id: string
          show_taxes: boolean | null
          signature_image_url: string | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          approved_by_name?: string | null
          company_address?: string | null
          company_email?: string | null
          company_name?: string | null
          company_nit?: string | null
          company_phone?: string | null
          created_at?: string | null
          document_code?: string | null
          footer_contact_text?: string | null
          format_date?: string | null
          id?: string
          logo_url?: string | null
          observations_default?: string | null
          primary_color?: string | null
          restaurant_id: string
          show_taxes?: boolean | null
          signature_image_url?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          approved_by_name?: string | null
          company_address?: string | null
          company_email?: string | null
          company_name?: string | null
          company_nit?: string | null
          company_phone?: string | null
          created_at?: string | null
          document_code?: string | null
          footer_contact_text?: string | null
          format_date?: string | null
          id?: string
          logo_url?: string | null
          observations_default?: string | null
          primary_color?: string | null
          restaurant_id?: string
          show_taxes?: boolean | null
          signature_image_url?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_pdf_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string
          expected_delivery_date: string | null
          id: string
          notes: string | null
          order_date: string
          order_number: string
          restaurant_id: string
          status: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number: string
          restaurant_id: string
          status?: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string
          restaurant_id?: string
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          recipe_id: string
          restaurant_id: string
          unit: string
          yield_per_portion: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          recipe_id: string
          restaurant_id: string
          unit?: string
          yield_per_portion?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          recipe_id?: string
          restaurant_id?: string
          unit?: string
          yield_per_portion?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_production_run_items: {
        Row: {
          actual_line_cost: number
          actual_quantity: number
          created_at: string
          id: string
          product_id: string
          run_id: string
          theoretical_line_cost: number
          theoretical_quantity: number
          unit: string
          unit_cost: number
        }
        Insert: {
          actual_line_cost?: number
          actual_quantity?: number
          created_at?: string
          id?: string
          product_id: string
          run_id: string
          theoretical_line_cost?: number
          theoretical_quantity?: number
          unit?: string
          unit_cost?: number
        }
        Update: {
          actual_line_cost?: number
          actual_quantity?: number
          created_at?: string
          id?: string
          product_id?: string
          run_id?: string
          theoretical_line_cost?: number
          theoretical_quantity?: number
          unit?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_production_run_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_production_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "recipe_production_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_production_runs: {
        Row: {
          actual_total_cost: number
          actual_unit_cost: number
          created_at: string
          id: string
          notes: string | null
          produced_by: string
          production_date: string
          quantity_produced: number
          recipe_id: string
          restaurant_id: string
          theoretical_total_cost: number
          theoretical_unit_cost: number
        }
        Insert: {
          actual_total_cost?: number
          actual_unit_cost?: number
          created_at?: string
          id?: string
          notes?: string | null
          produced_by: string
          production_date?: string
          quantity_produced?: number
          recipe_id: string
          restaurant_id: string
          theoretical_total_cost?: number
          theoretical_unit_cost?: number
        }
        Update: {
          actual_total_cost?: number
          actual_unit_cost?: number
          created_at?: string
          id?: string
          notes?: string | null
          produced_by?: string
          production_date?: string
          quantity_produced?: number
          recipe_id?: string
          restaurant_id?: string
          theoretical_total_cost?: number
          theoretical_unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_production_runs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_production_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_variable_components: {
        Row: {
          component_mode: string
          component_name: string
          created_at: string
          id: string
          quantity_per_service: number
          recipe_id: string
          required: boolean
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          component_mode?: string
          component_name: string
          created_at?: string
          id?: string
          quantity_per_service?: number
          recipe_id: string
          required?: boolean
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          component_mode?: string
          component_name?: string
          created_at?: string
          id?: string
          quantity_per_service?: number
          recipe_id?: string
          required?: boolean
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_variable_components_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_variable_components_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          recipe_mode: string
          recipe_type: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          recipe_mode?: string
          recipe_type?: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          recipe_mode?: string
          recipe_type?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          function_key: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          function_key: string
          id?: string
          role: string
        }
        Update: {
          created_at?: string
          function_key?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_function_key_fkey"
            columns: ["function_key"]
            isOneToOne: false
            referencedRelation: "system_functions"
            referencedColumns: ["key"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          label: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          label: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          label?: string
          name?: string
        }
        Relationships: []
      }
      room_types: {
        Row: {
          active: boolean
          amenities: Json | null
          base_rate: number
          created_at: string
          description: string | null
          id: string
          max_occupancy: number
          name: string
          restaurant_id: string
        }
        Insert: {
          active?: boolean
          amenities?: Json | null
          base_rate?: number
          created_at?: string
          description?: string | null
          id?: string
          max_occupancy?: number
          name: string
          restaurant_id: string
        }
        Update: {
          active?: boolean
          amenities?: Json | null
          base_rate?: number
          created_at?: string
          description?: string | null
          id?: string
          max_occupancy?: number
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          floor: string | null
          id: string
          notes: string | null
          restaurant_id: string
          room_number: string
          room_type_id: string
          status: string
        }
        Insert: {
          created_at?: string
          floor?: string | null
          id?: string
          notes?: string | null
          restaurant_id: string
          room_number: string
          room_type_id: string
          status?: string
        }
        Update: {
          created_at?: string
          floor?: string | null
          id?: string
          notes?: string | null
          restaurant_id?: string
          room_number?: string
          room_type_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          active: boolean
          category_id: string
          created_at: string
          id: string
          restaurant_id: string
          service_id: string
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          id?: string
          restaurant_id: string
          service_id: string
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          id?: string
          restaurant_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "operational_services"
            referencedColumns: ["id"]
          },
        ]
      }
      stay_guests: {
        Row: {
          created_at: string
          guest_id: string
          id: string
          is_primary: boolean
          stay_id: string
        }
        Insert: {
          created_at?: string
          guest_id: string
          id?: string
          is_primary?: boolean
          stay_id: string
        }
        Update: {
          created_at?: string
          guest_id?: string
          id?: string
          is_primary?: boolean
          stay_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stay_guests_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "hotel_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stay_guests_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
        ]
      }
      stays: {
        Row: {
          check_in_at: string
          check_out_at: string | null
          company_id: string | null
          created_at: string
          created_by: string
          expected_check_out: string | null
          id: string
          notes: string | null
          payment_method: string | null
          rate_per_night: number
          restaurant_id: string
          room_id: string
          source_rate: string
          status: string
          total_amount: number
        }
        Insert: {
          check_in_at?: string
          check_out_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by: string
          expected_check_out?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          rate_per_night?: number
          restaurant_id: string
          room_id: string
          source_rate?: string
          status?: string
          total_amount?: number
        }
        Update: {
          check_in_at?: string
          check_out_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          expected_check_out?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          rate_per_night?: number
          restaurant_id?: string
          room_id?: string
          source_rate?: string
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "stays_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hotel_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          nit: string | null
          notes: string | null
          phone: string | null
          restaurant_id: string
        }
        Insert: {
          active?: boolean
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          nit?: string | null
          notes?: string | null
          phone?: string | null
          restaurant_id: string
        }
        Update: {
          active?: boolean
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          nit?: string | null
          notes?: string | null
          phone?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_functions: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      transformation_definition_outputs: {
        Row: {
          created_at: string
          expected_yield_percent: number | null
          id: string
          output_product_id: string
          output_type: string
          transformation_definition_id: string
        }
        Insert: {
          created_at?: string
          expected_yield_percent?: number | null
          id?: string
          output_product_id: string
          output_type?: string
          transformation_definition_id: string
        }
        Update: {
          created_at?: string
          expected_yield_percent?: number | null
          id?: string
          output_product_id?: string
          output_type?: string
          transformation_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_definition_out_transformation_definition_id_fkey"
            columns: ["transformation_definition_id"]
            isOneToOne: false
            referencedRelation: "transformation_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_definition_outputs_output_product_id_fkey"
            columns: ["output_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_definitions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          input_product_id: string
          name: string
          restaurant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          input_product_id: string
          name: string
          restaurant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          input_product_id?: string
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_definitions_input_product_id_fkey"
            columns: ["input_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_definitions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_logs: {
        Row: {
          created_at: string
          id: string
          input_product_id: string
          input_quantity: number
          notes: string | null
          output_product_id: string
          output_quantity: number
          performed_at: string
          performed_by: string
          process_id: string | null
          restaurant_id: string
          waste_product_id: string | null
          waste_quantity: number
          yield_percentage: number
        }
        Insert: {
          created_at?: string
          id?: string
          input_product_id: string
          input_quantity: number
          notes?: string | null
          output_product_id: string
          output_quantity: number
          performed_at?: string
          performed_by: string
          process_id?: string | null
          restaurant_id: string
          waste_product_id?: string | null
          waste_quantity?: number
          yield_percentage?: number
        }
        Update: {
          created_at?: string
          id?: string
          input_product_id?: string
          input_quantity?: number
          notes?: string | null
          output_product_id?: string
          output_quantity?: number
          performed_at?: string
          performed_by?: string
          process_id?: string | null
          restaurant_id?: string
          waste_product_id?: string | null
          waste_quantity?: number
          yield_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "transformation_logs_input_product_id_fkey"
            columns: ["input_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_logs_output_product_id_fkey"
            columns: ["output_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_logs_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "transformation_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_logs_waste_product_id_fkey"
            columns: ["waste_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_processes: {
        Row: {
          active: boolean
          created_at: string
          expected_yield: number | null
          id: string
          input_product_id: string
          name: string
          output_product_id: string
          restaurant_id: string
          waste_product_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          expected_yield?: number | null
          id?: string
          input_product_id: string
          name: string
          output_product_id: string
          restaurant_id: string
          waste_product_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          expected_yield?: number | null
          id?: string
          input_product_id?: string
          name?: string
          output_product_id?: string
          restaurant_id?: string
          waste_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transformation_processes_input_product_id_fkey"
            columns: ["input_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_processes_output_product_id_fkey"
            columns: ["output_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_processes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_processes_waste_product_id_fkey"
            columns: ["waste_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_run_outputs: {
        Row: {
          calculated_unit_cost: number
          created_at: string
          id: string
          output_product_id: string
          output_type: string
          quantity: number
          transformation_run_id: string
          yield_percent: number
        }
        Insert: {
          calculated_unit_cost?: number
          created_at?: string
          id?: string
          output_product_id: string
          output_type?: string
          quantity: number
          transformation_run_id: string
          yield_percent?: number
        }
        Update: {
          calculated_unit_cost?: number
          created_at?: string
          id?: string
          output_product_id?: string
          output_type?: string
          quantity?: number
          transformation_run_id?: string
          yield_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "transformation_run_outputs_output_product_id_fkey"
            columns: ["output_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_run_outputs_transformation_run_id_fkey"
            columns: ["transformation_run_id"]
            isOneToOne: false
            referencedRelation: "transformation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_runs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          input_product_id: string
          input_quantity: number
          input_unit_cost: number
          notes: string | null
          overall_yield: number
          restaurant_id: string
          run_date: string
          total_output: number
          total_waste: number
          transformation_definition_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          input_product_id: string
          input_quantity: number
          input_unit_cost?: number
          notes?: string | null
          overall_yield?: number
          restaurant_id: string
          run_date?: string
          total_output?: number
          total_waste?: number
          transformation_definition_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          input_product_id?: string
          input_quantity?: number
          input_unit_cost?: number
          notes?: string | null
          overall_yield?: number
          restaurant_id?: string
          run_date?: string
          total_output?: number
          total_waste?: number
          transformation_definition_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transformation_runs_input_product_id_fkey"
            columns: ["input_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_runs_transformation_definition_id_fkey"
            columns: ["transformation_definition_id"]
            isOneToOne: false
            referencedRelation: "transformation_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          role: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_reason_catalog: {
        Row: {
          active: boolean
          created_at: string
          id: string
          reason: string
          restaurant_id: string
          waste_type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          reason: string
          restaurant_id: string
          waste_type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          reason?: string
          restaurant_id?: string
          waste_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_reason_catalog_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_order_number: {
        Args: { p_restaurant_id: string }
        Returns: string
      }
      get_my_permissions: {
        Args: never
        Returns: {
          function_key: string
        }[]
      }
      get_my_restaurant_id: { Args: never; Returns: string }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_permission: {
        Args: { _function_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      recalculate_all_stock: {
        Args: never
        Returns: {
          difference: number
          new_stock: number
          old_stock: number
          product_id: string
          product_name: string
        }[]
      }
      register_recipe_consumption:
        | {
            Args: {
              _notes: string
              _portions: number
              _recipe_id: string
              _user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _notes: string
              _portions: number
              _recipe_id: string
              _user_id: string
            }
            Returns: undefined
          }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
