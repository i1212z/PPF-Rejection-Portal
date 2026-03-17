import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui/Card';

const PRODUCT_SUGGESTIONS = [
  'Arugula(Rocket Lettuce)',
  'Asparagus',
  'Avocado',
  'BABUGOSHA PEAR',
  'Baby Bokchoy',
  'Baby Carrot',
  'Baby Corn',
  'BABY SPINACH BOX',
  'Basil',
  'Beetroot Leaves',
  'Beetroot with Leaves',
  'BIRDS EYE CHILLI',
  'Black Amber Plum',
  'Black Berry',
  'Blood Orange',
  'BLUEBERRY A GRADE',
  'BLUEBERRY B GRADE',
  'Blueberry Premium',
  'Bok Choy',
  'Broccoli',
  'Brussels Sprouts',
  'Butter Beans',
  'Butterhead lettuce',
  'Button Mushroom',
  'Cabbage Red',
  'Cabbage White',
  'Capsicum B Grade',
  'Capsicum Green',
  'Capsicum Red',
  'Capsicum Yellow',
  'Cauliflower',
  'Celery',
  'Chausa Mangoes',
  'CHERRY A GRADE',
  'CHERRY B GRADE',
  'CHERRY PREMIUM',
  'Cherry Tomato',
  'Chinese Cabbage',
  'Chives',
  'CRIMSON PLUM',
  'Curly Parsley',
  'Dill Leaves',
  'Egg Fruit',
  'English Cucumber',
  'Fennel Bulb',
  'Fennel Leaves',
  'Flat Parsely',
  'Fresh Ooty Beetroot',
  'Fresh Ooty Carrot',
  'Fresh Ooty Potato',
  'Ghee chilli Red',
  'Ghee chilly',
  'GOLDEN APPLE',
  'Gooseberries',
  'GRANNY SMITH APPLES',
  'Grapfruit',
  'GREEN ALMONDS',
  'Green Peas',
  'HALF RED PEAR',
  'Haricot Beans',
  'Hass Avocado',
  'Hill Garlic',
  'HIMALAYAN CHERRY (DURO NERO)',
  'HIMALAYAN CHERRY (MERCHANT)',
  'HIMALAYAN CHERRY (STELLA)',
  'Iceberg Lettuce',
  'KAFFIR LEMON LEAF',
  'Kale Leaves',
  'Kale Red',
  'KIWI',
  'Knol Khol',
  'Langra Mangoes',
  'Leeks',
  'Lemon grass',
  'Lemon Lisbon',
  'Lettuce Curly Green',
  'Lettuce Red',
  'Lollo Bionda Lettuce',
  'Lollo Rosa',
  'LOTUS STEM',
  'Mangosteen',
  'Mangosteen B grade',
  'MARIPOSA PLUM',
  'Mayer Lemon',
  'Microgreens-Beetroot',
  'Micro Greens-Broccoli',
  'Micro Greens-Green Peas',
  'Micro Greens-Radish',
  'Micro Greens (Red Cabbage)',
  'MICROGREENS (SUNFLOWER)',
  'MIXED SALAD GREENS BOX',
  'NAVEL ORANGE',
  'NECTARINE PEACH',
  'Oak Lettuce',
  'Ooty Carrot with Leaves',
  'Oregano',
  'Oyster Mushroom',
  'PALAK',
  'PASSION FRUIT',
  'PEACH',
  'Peaches',
  'Pear',
  'Persian Lemon',
  'Pineberry',
  'Potato Baby',
  'Purple Passion Fruit',
  'Radish Leaves',
  'Radish Red',
  'Radish White',
  'RAMBUTAN',
  'Raspberry',
  'RED APPLE',
  'Red Beaut Plum',
  'RED PEAR',
  'Rhubarb',
  'Romaine Lettuce',
  'Rosemary',
  'Sage',
  'Salad Spinach',
  'Santa Rose Plum',
  'Shiitake Mushroom',
  'SNACK PEPPERS',
  'SOURSOP',
  'Spring Onion',
  'Star Fruit',
  'Strawberry A Grade',
  'Strawberry B-Grade',
  'Strawberry- C Grade',
  'Sweetcorn',
  'Swiss Chard',
  'Table Radish',
  'Tarragon',
  'Thyme',
  'TIDEMAN APPLE',
  'Tree Tomato',
  'Turnip',
  'Walnut',
  'Watercress lettuce',
  'Watery Apple',
  'Yellow Cherry Tomato',
  'Yellow Passion Fruit',
  'Zucchini Flower',
  'Zucchini Green',
  'Zucchini Yellow',
];

const CUSTOMER_SUGGESTIONS = [
  'Moolans Family Mart Angamaly',
  'Azeezia Organic Supermarkets',
  'Nourish',
  'Spineys Margin Free Super Market',
  'Moolans Family Mart Irinjalakuda',
  'Moolans Family Mart Kothamangalam',
  'Moolans Hyper Market North',
  'Kalyan Hyper Market Thrissur',
  'Chalil Margin Free Market',
  'Chocko Choza',
  'Farm Fresh organics and naturals',
  'Cafficana Kochi',
  'Edibles Kitchen',
  'Salkkaar Restaurant',
  'Palu Brothers',
  'Mancherikalam Hypermarket Thengana',
  'Soul Kitchen Co',
  'FRUITBAE ALUVA',
  'Aswathi Mart',
  'FRUITBAE VENNALA',
  'BURGERY HOSPITALITY VENTURES PRIVATE LIMITED',
  'Bake Point Kochi',
  'MALABAR VILLAGE RESTAURANT',
  'Grana Pizzeria',
  'Future Food',
  'Jessica Big Shoppy',
  'Prime Super Market Thevara',
  'Favourite',
  'Navya Bakes',
  'Elite Super Market Thrissur',
  'Pantree by Thomson',
  'Bake Point Thrissur',
  'Enline Enterprises LLP',
  'Happy Souls Italian Restaurant LLP',
  'Buns and Beans Muvattupuzha',
  'TONICO MART',
  'TT Salads and Grill LLP',
  'KPR Fruits and Vegetable',
  'Bharath Fruits',
  'Mancherikalam JJS Hyper Market Changanassery',
  'Kalyan Palakkad',
  'FROOS RETAIL LLP',
  'KITCHEN ONE',
  'SNV Holdings Private Limited',
  'Buns and beans Bypass',
  'The French Door',
  'Burgeria',
  'LuBaCa',
  'The backwaters',
  'Cson Repeat',
  'Madheena Fruits',
  'Brew Tactics',
  'Pro Calories Life Pvt Ltd',
  'NRP Vegetables Alappuzha',
  'Parna farms',
  'FRUITBAE Thirunelveli',
  'Burger Lounge Angamaly',
  'Kalyan express mart Thrissur',
  'SUGAR DRIBBLE SWATHI OOTY -9094306094',
  'J Fruits',
  'KAD Vegetable Chalakudy',
  'Fruitbae Madurai',
  'Moolans Family Mart Paravoor',
  'Le Torta',
  'FRUITBAE THRISSUR',
  'Divine Delicacies',
  'French Toast Panampilly Nagar',
  'Burger Lounge Thiruvalla',
  'The Town House Cafe',
  '7 to 9 Green Store Tripunithura',
  '7to9 Greenstore Panambilly Nagar',
  'Burger Lounge Palarivattam',
  'FRUITBAE PERUMBAVOOR',
  'THEKKEKARA HOTOVEN BAKERS',
  'Burger Lounge Irinjalakuda',
  'Olive Mart',
  'Burger Lounge North Paravoor',
  'Know Your Roots',
  'Kabini Resorts - Mysore',
  'Burger Lounge Thrissur',
  'Quality Super Bazar',
  'MaFarm',
  'DHEEMAHI AYURVEDIC PRIVATE LIMITED',
  'FRUITBAE ALAPPUZHA',
  'Epic poetry cafe',
  'FRUITBAE THIRUVALLA',
  'Cafe Adicct',
  'FRUITBAE ADOOR',
  'Himayug Kaloor',
  'Banuzy',
  'Palathingal Ventures LLP',
  'BURGERINN KALADY',
  'Fruitbae Mysore',
  'New alankar hypermarket Perunna',
  'BOMBAY SANDWICH',
  'Healthy Mushroom',
  'FRUITBAE KOTTAYAM',
  'VS Agencies',
  'Burger Lounge Kodungallur',
  'Thakkali organic shop',
  'CHOC O LICK',
  'Veega Fruits and vegetables',
  'OOTACAMUND CLUB',
  'RD cafe',
  'COZ Coffee',
  'SMOKIN BURG THRISSUR',
  'FRUITBAE KAKKANAD',
  'Burger Lounge Kakkanad',
  'Fruitbae Trichy',
  'Fruitbae Karur',
  'Britan to Bombay',
  'Hotel Arcadia Avenue',
  'CHOC O LICK Ernakulam',
  'Padmapriya-Thiruppur',
  'VNS Vegetable Kottayam',
  'Kochi Exihibition',
  'Agroshield technologies Pvt Ltd',
  'Cafe by Ann and Eliza',
  'Mrs Hilda Nixon Chennai',
  'GM InTech Corp',
  'Sandeep Juice Shop',
  'Fathima Hypermarket',
  'Farsi Arabic Cafe',
  'Magic Rainbow',
  'Haribhavanam Hotel',
  'Family Special',
  'SAM Tuticorin',
  'MADHURA PAZHAMUDHIR NILAYAM',
  'SPINNERS CHANGANASSERY',
  'Choco Loca (Cakes and Cafe) Trichy',
  'Cafe trip is life',
  'Food Storyz',
  'Regency Bake House',
  'Favourite Pizza',
  'Burgery Restaurant BLR LLP',
  'Melt n Mingle',
  'Boxed By Butterquenelle',
  'Third Place Cafe',
  'HealthOji',
  'FRUITBAE THIRUPPUR',
  'Leafit Microgreens',
  'Hotel Akshaya Punkunnam',
  'Zaitoon Signature',
  'KNA Fruits cherthala',
  'Murphy Vijayan',
  'Spinners Thiruvalla',
  'Pradeep Fruitbae',
  'Smatchet Restaurants and Cafes Pvt Ltd',
  'D7 Ventures Private Limited',
  'Frozen Mart',
  'AWC NUTRIVENTURES PRIVATE LIMITED',
  'Z to A',
  'livli cafe',
  'Eat Alley Cafe',
  'Cocoa Tree',
  'Malabar Berries',
  'Waffles Street',
  'Basith Vegetables',
  'Martins Mocktails',
  'Royal Residency',
  'Sukumar Madurai',
  'Curly Cafe 94863 55082',
  'Burger N Me',
  'Artisan Foods and Beverages',
  'FRUITBAE COIMBATORE',
  'The Kochi Cookhouse',
  'Dessi Cuppa',
  'Beyondburg INC Kochi',
  'SIVAJI FRUITS (ASR FRUITS)-CHENNAI',
  'Hearty Bake Factory',
  'BURGER N ME PUTHANPALLY',
  'CAFE ADDICT PRIVATE LIMITED',
  'Tamaki',
  'No13 burger club',
  'Brunton Boatyard',
];

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canChooseChannel = user?.role === 'admin' || user?.role === 'manager';
  const [channel, setChannel] = useState<'B2B' | 'B2C'>('B2B');
  const [productType, setProductType] = useState<'single' | 'multiple'>('single');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [deliveryBatch, setDeliveryBatch] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [lineItems, setLineItems] = useState<
    { productName: string; quantity: number | ''; reason: string }[]
  >([{ productName: '', quantity: '', reason: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!deliveryDate || !deliveryBatch) {
          setError('Please fill all required fields.');
          setSubmitting(false);
          return;
        }

      if (productType === 'single') {
        if (!productName || !quantity || !reason) {
          setError('Please fill all required fields.');
          setSubmitting(false);
          return;
        }

        await apiClient.post('/tickets', {
          product_name: productName,
          quantity,
          reason,
          delivery_batch: deliveryBatch,
          delivery_date: deliveryDate,
          ...(canChooseChannel && { channel }),
        });
      } else {
        const validItems = lineItems.filter(
          (item) =>
            item.productName &&
            item.quantity &&
            Number(item.quantity) > 0 &&
            item.reason,
        );

        if (validItems.length === 0) {
          setError('Please add at least one valid rejected product.');
          setSubmitting(false);
          return;
        }

        await Promise.all(
          validItems.map((item) =>
            apiClient.post('/tickets', {
              product_name: item.productName,
              quantity: Number(item.quantity),
              reason: item.reason,
              delivery_batch: deliveryBatch,
              delivery_date: deliveryDate,
              ...(canChooseChannel && { channel }),
            }),
          ),
        );
      }
      navigate('/tickets');
    } catch (err) {
      setError('Could not create ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Create rejection ticket</h2>
          <p className="text-sm text-gray-500">
            Capture quantity and reason for today&apos;s rejections.
          </p>
        </div>
        <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] text-gray-600">
          Delivery frequency: every 2 days
        </div>
      </div>
      <Card
        title="Ticket details"
        subtitle="Product, delivery, and rejection information"
        className="text-sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Delivery Date
              </label>
              <input
                type="date"
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Customer Name
              </label>
              <input
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                value={deliveryBatch}
                onChange={(e) => setDeliveryBatch(e.target.value)}
                required
                placeholder="Customer or account name"
                list="customer-suggestions"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Product type
              </label>
              <select
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                value={productType}
                onChange={(e) => setProductType(e.target.value as 'single' | 'multiple')}
              >
                <option value="single">Single product</option>
                <option value="multiple">Multiple products</option>
              </select>
            </div>
            {canChooseChannel && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Channel
                </label>
                <select
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as 'B2B' | 'B2C')}
                >
                  <option value="B2B">B2B</option>
                  <option value="B2C">B2C</option>
                </select>
              </div>
            )}
          </div>

          {productType === 'single' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Product Name
                  </label>
                  <input
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    required
                    list="product-suggestions"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quantity Rejected
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Reason for Rejection
                </label>
                <textarea
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 min-h-[80px]"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div className="border border-gray-200 rounded-md">
                <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">Rejected products</span>
                  <button
                    type="button"
                    onClick={() =>
                      setLineItems((prev) => [
                        ...prev,
                        { productName: '', quantity: '', reason: '' },
                      ])
                    }
                    className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-100"
                  >
                    + Add product
                  </button>
                </div>
                <div className="divide-y divide-gray-200">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="px-3 py-2 grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Product
                        </label>
                        <input
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900"
                          value={item.productName}
                          onChange={(e) =>
                            setLineItems((prev) =>
                              prev.map((li, i) =>
                                i === idx ? { ...li, productName: e.target.value } : li,
                              ),
                            )
                          }
                          placeholder="e.g. Strawberry Box"
                          list="product-suggestions"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min={0}
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900"
                          value={item.quantity}
                          onChange={(e) =>
                            setLineItems((prev) =>
                              prev.map((li, i) =>
                                i === idx
                                  ? {
                                      ...li,
                                      quantity: e.target.value === '' ? '' : Number(e.target.value),
                                    }
                                  : li,
                              ),
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Reason
                        </label>
                        <textarea
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 min-h-[40px]"
                          value={item.reason}
                          onChange={(e) =>
                            setLineItems((prev) =>
                              prev.map((li, i) =>
                                i === idx ? { ...li, reason: e.target.value } : li,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="md:col-span-4 flex justify-end">
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setLineItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-[11px] text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-700">
                <span className="font-semibold">
                  Total rejected products: {lineItems.filter((i) => i.productName).length}
                </span>
                <span className="text-[11px] text-gray-500">
                  One ticket = one customer + delivery; multiple rejected products can be added here.
                </span>
              </div>
            </>
          )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate('/tickets')}
            className="rounded-md border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 text-xs font-medium text-white"
          >
            {submitting ? 'Submitting…' : 'Raise Ticket'}
          </button>
        </div>
        </form>
      </Card>

      <datalist id="product-suggestions">
        {PRODUCT_SUGGESTIONS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <datalist id="customer-suggestions">
        {CUSTOMER_SUGGESTIONS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}


