package copilot

import (
"encoding/json"
"fmt"
"testing"
)

func TestReadSessionDB_Output(t *testing.T) {
data, err := ReadSessionDB()
if err != nil {
t.Fatalf("Error: %v", err)
}
if data == nil {
t.Fatal("No data returned")
}
// Pretty print
var out map[string]json.RawMessage
json.Unmarshal(data, &out)
for k, v := range out {
fmt.Printf("%s: %s\n", k, string(v))
}
}
