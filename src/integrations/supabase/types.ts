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
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          notes: string | null
          order_date: string
          restaurant_id: string
          status: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          order_date?: string
          restaurant_id: string
          status?: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          order_date?: string
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
      recipes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          recipe_type: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          recipe_type?: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
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
