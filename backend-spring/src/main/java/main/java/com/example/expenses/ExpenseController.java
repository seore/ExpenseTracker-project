package main.java.com.example.expenses;
import org.springframework.web.bind.annotation.*; import java.util.*;
@RestController @RequestMapping("/api/expenses") @CrossOrigin
public class ExpenseController {
  private final ExpenseRepository repo; public ExpenseController(ExpenseRepository r){ this.repo = r; }
  @GetMapping public List<Expense> list(){ return repo.findAll(); }
  @PostMapping public Expense create(@RequestBody Expense e){ if(e.getTitle()==null||e.getTitle().isBlank()|| e.getAmount()==null || e.getAmount()<=0) throw new IllegalArgumentException("Invalid"); return repo.save(e); }
  @PutMapping("/{id}") public Expense update(@PathVariable Long id, @RequestBody Expense in){ return repo.findById(id).map(e->{ e.setTitle(in.getTitle()); e.setAmount(in.getAmount()); e.setCategory(in.getCategory()); e.setDate(in.getDate()); e.setUserId(in.getUserId()); return repo.save(e);} ).orElseThrow(); }
  @DeleteMapping("/{id}") public void delete(@PathVariable Long id){ repo.deleteById(id); }
}