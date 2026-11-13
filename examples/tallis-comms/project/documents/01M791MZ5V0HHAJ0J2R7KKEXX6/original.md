# TLC-COM-03: Systems, Customer Data and Media Directory

Tallis Home Products · Corporate Communications and Information Security · Revision 2

## 1. The company in numbers

Tallis Home Products, Inc. was founded in 1962 in Dayton, Ohio. It had 6,800 employees, net sales of 2.4 billion dollars, and three business lines: small kitchen appliances (52 percent of sales), floor and surface cleaning (33 percent) and a subscription for replacement filters and pods (15 percent). Retail partners carry 86 percent of sales, led by Brightwater Markets and a national home goods chain; the web store, tallishome.example, makes up 14 percent. The headquarters is at the Tallis campus in Dayton; plants are in Springfield, Ohio, and Cleveland, Tennessee. The customer care center in Dayton has 120 agents and is open 7:00 a.m. to 9:00 p.m. Eastern.

## 2. Customer data systems

- **Web store.** Built and hosted by the vendor CartBridge Commerce (fictional) on its cloud. Holds 1.9 million registered accounts: name, email address, shipping and billing address, phone number if given, order history, a salted and hashed password (bcrypt) and a payment token. It does not hold full card numbers; the payment processor, Lakeview Payments, issues the token and holds the card.
- **Loyalty program, Tallis Rewards.** 610,000 members, a subset of web store accounts, with points balance and birth month.
- **Customer care system.** Tickets with customer name, contact details and the text the agent typed, which can include order numbers and sometimes addresses.
- **Email service.** Sends the order and newsletter email; the account has a send limit of 400,000 messages per hour, which governs how fast an email to every affected customer can go out.
- **Security monitoring.** The security operations center (SOC) in Dayton, staffed 24 hours; alerts go to the on-call analyst and the CISO. The forensic firm on retainer is Cardinal Forensics, 24 hours, (937) 555-0148.

## 3. Publishing and listening systems

The newsroom page and the website banner are changed by Corporate Communications in 10 minutes. Company accounts are run from the social tool with two-person approval. Social listening runs 24 hours with a keyword set that includes the brand, "Tallis breach", "Tallis hack" and "tallishome.example". A status page for the web store is at status.tallishome.example. The wire service desk used for company releases is the fictional Midwest Business Wire.

## 4. Outside media and platforms (fictional)

These are simulated; they stand for the kinds of outlets the company meets.

| Outlet | Type | Contact habit |
|---|---|---|
| The Valley Courier | Daily regional newspaper, Dayton | Business reporter Carla Mendoza; deadline 4:00 p.m. for next-day print, files online any time |
| Miami Valley 9 News | Local TV, noon and 6:00 p.m. news | Reporter Jason Teller; asks for a live interview; wants B-roll of the campus |
| TechSignal Daily | Technology trade site | Reporter Ines Okonkwo; follows breach forums; usually emails with a 3-hour deadline |
| Midwest Business Wire | Wire service | Desk editor Paul Gaskill; sends a bulletin on any company data incident |
| Consumer Notebook | Consumer affairs blog | Editor Rita Szabo; publishes complaints and screenshots from customers |
| Open Ledger Check | Independent fact-checking organization | Checks viral claims, asks for a statement and the evidence |
| The social platforms' trust and safety teams | Report forms and a priority line for verified companies | Respond to impersonation reports in 2 to 6 hours |

## 5. Retail and partner contacts

Brightwater Markets category manager Fiona Ledesma, (937) 555-0152; the national home goods chain's vendor manager, Curtis Holm. Retailers are told within 30 minutes after the first public statement. They ask whether product or payment at their stores is affected; the answer is on the fact sheet.

## 6. Regulators and others who ask questions

The Ohio Attorney General's Consumer Protection Section; state attorneys general of other states where customers live; the SEC Division of Corporation Finance (through the General Counsel only); the FBI Cincinnati Field Office; CISA. The Federal Trade Commission is told by the General Counsel where the facts call for it. The cyber insurer is Redwater Mutual through the broker Midland Risk Partners.

## 7. Phone, email and bridge list

Press line (937) 555-0141 · press@tallishome.example · Customer care (937) 555-0150 · Investor line (937) 555-0145 · Communications Cell bridge (937) 555-0149, code 4100 · Employee hotline (937) 555-0153. All Tallis exercise email uses tallishome.example; the retailer uses brightwatermarkets.example; the reporters use their outlets' .example domains.

## 8. A normal day on the web store

About 11,000 orders on a weekday; 38 percent of customers log in with a saved password; 2,300 password resets a week. A spike above 6,000 resets in an hour is a signal that customers are reacting to news. The customer email that tells affected people to change a password must link to a page on tallishome.example only, and must not contain a button that asks for a password, because the phishing copies will.
