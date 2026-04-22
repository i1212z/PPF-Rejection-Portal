/** Shared datalist suggestions for rejection tickets and B2B credit notes (customer names). */

function normalizeSuggestions(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    const v = line.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export const PRODUCT_SUGGESTIONS = normalizeSuggestions(`
artichokes
Arugula(Rocket Lettuce)
Asparagus
Avocado
Baby Bokchoy
Baby Corn
Baby Corn-200gm
BABY SPINACH BOX
Basil
BLUEBERRY A GRADE
BLUEBERRY B GRADE
Bok Choy
Broccoli
BROCCOLI (FLORETS)
Brussels Sprouts
Butter Beans
Butterhead lettuce
Button Mushroom
Cabbage Red
Cabbage White
Capsicum B Grade
Capsicum Green
Capsicum Red
Capsicum Yellow
Celery
Cherry Tomato
Chinese Cabage
Chinese Cabbage
Chives
Curly Parsley
Dill Leaves
Farm Luxe Combo
Fennel Leaves
Five Berry Box
Fresh Ooty Beetroot
Fresh Ooty Carrot
FRESH OOTY CARROT,pOTATO ,HARICOT BEANS , BUTTON MUSHROOMS ,GREEN LETTUCE
Fresh Ooty Potato
GREEN LETTUCE BOX
Green Peas
Haricot Beans
Iceberg Lettuce
Kale Leaves
Kale Red
Knol Khol
Leeks
Lemon grass
Lettuce Curly Green
Lettuce Red
Micro Greens-Radish
MIXED SALAD GREENS
MIXED SALAD GREENS BOX
Mushroom
Ooty Carrot with Leaves
Oregano
PASSION FRUIT
Potato Baby
Radish Red
Raspberry
Romaine Lettuce
Rosemary
Sage
Salad Spinach
Spring Onion
STRAWBERRY PREMIUM
strawberry a grade
strawberry b grade
strawberry c grade
Thyme
Watercress lettuce
Zuccchini green
Zucchini Green
Zucchini Yellow
`);

export const CUSTOMER_SUGGESTIONS = normalizeSuggestions(`
Favas-9048054455-Head Office
COMMUNITY INDIA HOSPITALITY & RESORTS PRIVATE
Dreamline Vegetables
FARM FOLKS-BANGALORE
FENNYS INDIA PRIVATE LIMITED
Fruits Valley Agritech Ventures LLP
KAFFEEKLATSCH HOSPITALITY
Mukund Bangalore
PSK Ventures-Mysore
Reliance Retail Limited - Bangalore
Shakthi food and beverage services LLP
Calicut Customers
1980
1980 Meppadi
AADHI AARU EXCLUSIVE
Abid Palayam
Abraham(Headoffice)
Anjali Madam
Bake point Calicut
BERRIXO
Beyondburg INC Calicut
BROWNTOWN CALICUT
Brown Town Kannur Road
Bucho
Burger Lounge Kacheri
Burger Lounge Kalpetta
Burger Lounge Kottuli
CAFFICANA CALICUT
Cakefully
Calicut Exhibition
CENTER VEGETABLE
CHOC O LICK CALICUT
CHOPSUEY
Cremmery
Dessert storm
Dilli Kabab
Dr joshima-7639461546
Eat House Restaurant & Catering LLP
Eatmosphere
Feel laban
Feellaban Tirur
Flame N Go Hilite
Flame N Go Lulu
Flame N Go Restaurant
FRUITBAE CALICUT
Fruitbae Calicut Beach
FRUITBAE KALPETTA
FRUITBAE SULTHAN BATHERY
Fruitbae Thalassery
Good Life
Green Corner
GROZHA CALICUT
HAPPY CUP
Hashtag Resto Cafe
Hyson Heritage
INDRIYA TRADERS
Jamjoom Hyper Market Kalpetta
Kalyan Calicut
KEF Hospitality India Pvt Ltd
Lady Loafella
Latin Street
Lords 83 Holidays LLP
Manuelsons Malabar Palace
Mazra Farmers Hub LLP
M.P Cherian - Sales (MD)
MR Hyper Market
MSV
Naura Hospitality LLP
New Hotel Lakkidi
Nismo Marketing Pvt Ltd-Diamond Mall
Nismo Marketing PVT LTD- Edappal
Nismo Marketing Pvt Ltd-Gokulam
Nismo Marketing Pvt Ltd-Hilite
Nismo Marketing Pvt Ltd-Kalpetta
Nismo Marketing PVT LTD- Kottakkal
Nismo Marketing PVT LTD -PMA
Niyas - Wayanad
Oshin hotel Kalpetta
Oshin Hotels & resorts
Ramana Calicut
Salad box
Sans Agrico
SHAWARAMA STOP
Sivakumaran - Executive Director
Slash Restocafe
SLO Labs By Cafficana
Social Sliders
Taaza Restaurant
Team KBR Foods LLP
The baker and Co
Vavees Fruits
VNS Perinthalmanna
Westwynn Resort LLP
WonderLoft Cafe stays
Zaitoon Restaurant
Zenha Zaina
Kochi & Kottayam Customers
7to9 Greenstore Panambilly Nagar
7 to 9 Green Store Tripunithura
AGAPE RESTO CAFE
Agroshield technologies Pvt Ltd
Artisan Foods and Beverages
ASHRAF CHERTHALA
Aswathi Mart
AWC NUTRIVENTURES PRIVATE LIMITED
Azeezia Organic Supermarkets
Bake Point Kochi
Banuzy
Basith Vegetables
Beyondburg INC Kochi
BOMBAY SANDWICH
Boxed By Butterquenelle
Brew Tactics
Britan to Bombay
Brunton Boatyard
Buns and beans Bypass
Buns and Beans Muvattupuzha
Buns & Beans Kothamangalam
Burgeria
BURGERINN KALADY
Burger Lounge Angamaly
Burger Lounge Kakkanad
Burger Lounge Palarivattam
Burger Lounge Thiruvalla
Burger N Me
BURGER N ME PUTHANPALLY
BURGERY HOSPITALITY VENTURES PRIVATE LIMITED
Burgery Restaurant BLR LLP
CAFE ADDICT PRIVATE LIMITED
Cafe by Ann and Eliza
Cafe trip is life
Cafficana Kochi
Chalil Margin Free Market
Chocko Choza
CHOC O LICK
CHOC O LICK Ernakulam
Choco Loca (Cakes and Cafe) Trichy
Cocoa Tree
COZ Coffee
Curly Cafe 94863 55082
D7 Ventures Private Limited
Dessi Cuppa
DHEEMAHI AYURVEDIC PRIVATE LIMITED
Divine Delicacies
Eat Alley Cafe
Edibles Kitchen
Enline Enterprises LLP
Epic poetry cafe
Family Special
Farm Fresh organics and naturals
Farsi Arabic Cafe
Fathima Hypermarket
Favourite
Favourite Pizza
Food Storyz
French Toast Panampilly Nagar
FROOS RETAIL LLP
Frozen Mart
FRUITBAE ADOOR
FRUITBAE ALAPPUZHA
FRUITBAE ALUVA
FRUITBAE COIMBATORE
FRUITBAE KAKKANAD
Fruitbae Karur
FRUITBAE KOTTAYAM
Fruitbae Mysore
FRUITBAE PERUMBAVOOR
FRUITBAE Thirunelveli
FRUITBAE THIRUPPUR
FRUITBAE THIRUVALLA
Fruitbae Trichy
FRUITBAE VENNALA
Future Food
Futur Foods Kochi
GM InTech Corp
Grana Pizzeria
Grapas Burger Lounch Thiruvalla
Haribhavanam Hotel
HealthOji
Healthy Mushroom
Hearty Bake Factory
Himayug Kaloor
Hotel Akshaya Punkunnam
Hotel Arcadia Avenue
JEEVAN FOODS THRISSUR
Jessica Big Shoppy
Kabini Resorts - Mysore
KAD Vegetable Chalakudy
Kargeen Restaurant
KITCHEN ONE
KNA Fruits cherthala
Know Your Roots
Kochi Exihibition
KPR Fruits and Vegetable
Leafit Microgreens
Le Torta
livli cafe
LuBaCa
MADHURA PAZHAMUDHIR NILAYAM
Magic Rainbow
Malabar Berries
MALABAR VILLAGE RESTAURANT
Mancherikalam Hypermarket Thengana
Mancherikalam JJS Hyper Market Changanassery
Martins Mocktails
Melt n Mingle
Moolans Family Mart Angamaly
Moolans Family Mart Kothamangalam
Moolans Family Mart Paravoor
Moolans Perumbavoor
Mrs Hilda Nixon Chennai
Murphy Vijayan
Navya Bakes
New Alankar Hyper Market
New alankar hypermarket Perunna
New Alankar Pathanathitta
Nilgiris Supermarket
No13 burger club
Nourish
NRP Vegetables Alappuzha
Olive Mart
OOTACAMUND CLUB
Padmapriya-Thiruppur
Palu Brothers
Pantree by Thomson
Parna farms
PMA Fruits
Pradeep Fruitbae
Prime Super Market Thevara
Pro Calories Life Pvt Ltd
Quality Super Bazar
RD cafe
Regency Bake House
Royal Residency
Salkkaar Restaurant
SAM Tuticorin
Sandeep Juice Shop
Smatchet Restaurants and Cafes Pvt Ltd
SNV Holdings Private Limited
Spineys Margin Free Super Market
SPINNERS CHANGANASSERY
Spinners Thiruvalla
SUGAR DRIBBLE SWATHI OOTY -9094306094
Sukumar Madurai
Tamaki
Thakkali organic shop
The backwaters
The French Door
The Kochi Cookhouse
The Town House Cafe
Third Place Cafe
TONICO MART
Veega Fruits and vegetables
VNS Vegetable Kottayam
VS Agencies
Waffles Street
Zaitoon Signature
Z to A
Thrissur Customers
Bake Point Thrissur
Bharath Fruits
Burger Lounge Irinjalakuda
Burger Lounge Kodungallur
Burger Lounge North Paravoor
Burger Lounge Thrissur
Cafe Adicct
Cson Repeat
Elite Super Market Thrissur
FRUITBAE THRISSUR
Happy Souls Italian Restaurant LLP
J Fruits
Kalyan Expressmart Koorkenchery
Kalyan express mart Thrissur
Kalyan Hyper Market Thrissur
Kalyan Palakkad
Madheena Fruits
MaFarm
Moolans Family Mart Irinjalakuda
Moolans Hyper Market North
Palathingal Ventures LLP
SMOKIN BURG THRISSUR
Soul Kitchen Co
THEKKEKARA HOTOVEN BAKERS
TT Salads and Grill LLP
Tamilnadu Customers
Chennai Customers
ABSOLUTE THAI - CHENNAI
Akimis Gourmet Chennai
Beyond Loaf-Chennai
Cassandra Foods
Forty Two Trading Company-Chennai
Guru Raj Chennai
Kadhir Organics Chennai
Mansi Sanghi-9150518666-Chennai
Naveen Chennai
Saritha Chennai
Sathya ( Thiruvanathapuram)
S.K Fruits Chennai - 8526426275
Srinivasan Chennai
The stubborn bakery-chennai
Coimbatore Customer
Woodbrai-9487788858
Farm Empolyee Sales
Ooty Customers
Modern Stores
Abad Hot Chicken Ooty
Adanwalla Coonoor
Alfa Cafe
Amrose-Muthorai
Anjana Tharun-Ketti
Arumaniyas
Beena Thomas-Cliff School Ooty
Coimbatore Exhibition
DINESH OOTY
Fresco Ooty
Gables Bunglow
Gana Suriyan -Ketti
Gowsika Thiruppur
Hemalatha Wheatley-9843588007
HME Ooty
Jamuna Ooty-9487505965
Jaya Prakash 7373751055
JEZREEL BIODYNAMIC FARMS
Kamini Chandar Jagadish
Kishore Belmont Ooty
LAWRANCE GARDEN-OOTY
Local Sales
Madhu -Pondicherry
Mohamed Afsar-Sales
Mrs.Molly Zachariah
MR.Udhayan Prestige Packers Ooty
Mr.V.B.Naidu  Ooty
Nisha Wayanad
Nishi 8025478308(Southwick)
Praveen 7010514533
Praveen Kumar Local Sales
PRK Fruits- Dharapuram
Rahul -6th Mail
Reena Jain
Reshna Ifthakar-9443574959
Rex Vijay
SEDGEMOOR
Shana Charingcross
Shanuvas
Sherina Pothan-9986313263
Snackers Republic Erode 8122636824
Soil Test-Horticulture Ooty
Suresh Belliraj-Ooty
Teveton Bungalow ooty
The Nilgiri Super Market - Coonoor
YMM OOTY
Chennai Exhibition
Fruitbae Madurai
NA FRESH PONDICHERRY
SIVAJI FRUITS (ASR FRUITS)-CHENNAI
`);
