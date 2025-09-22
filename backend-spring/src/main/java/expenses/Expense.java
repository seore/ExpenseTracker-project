package main.java.com.example.expenses;
import jakarta.persistence.*;
@Entity
public class Expense {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;
  private String title;
  private Double amount;
  private String category;
  private String date; // YYYY-MM-DD
  private String userId;
  public Long getId(){return id;} public void setId(Long id){this.id=id;}
  public String getTitle(){return title;} public void setTitle(String t){this.title=t;}
  public Double getAmount(){return amount;} public void setAmount(Double a){this.amount=a;}
  public String getCategory(){return category;} public void setCategory(String c){this.category=c;}
  public String getDate(){return date;} public void setDate(String d){this.date=d;}
  public String getUserId(){return userId;} public void setUserId(String u){this.userId=u;}
}