package store

type GroceryItem struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Checked bool   `json:"checked"`
}

func (s *Store) ListGroceryItems() ([]GroceryItem, error) {
	// Unchecked first (newest last, shopping-list order), checked at the
	// bottom until someone clears them.
	rows, err := s.db.Query(
		"SELECT id, name, checked FROM grocery_items ORDER BY checked, id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []GroceryItem{}
	for rows.Next() {
		var it GroceryItem
		if err := rows.Scan(&it.ID, &it.Name, &it.Checked); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

func (s *Store) AddGroceryItem(name string) (GroceryItem, error) {
	res, err := s.db.Exec("INSERT INTO grocery_items (name) VALUES (?)", name)
	if err != nil {
		return GroceryItem{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return GroceryItem{}, err
	}
	return GroceryItem{ID: id, Name: name}, nil
}

func (s *Store) ToggleGroceryItem(id int64) error {
	res, err := s.db.Exec("UPDATE grocery_items SET checked = NOT checked WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) DeleteGroceryItem(id int64) error {
	res, err := s.db.Exec("DELETE FROM grocery_items WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ClearCheckedGroceryItems() error {
	_, err := s.db.Exec("DELETE FROM grocery_items WHERE checked = 1")
	return err
}
