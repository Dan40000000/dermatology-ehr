import { pool } from "./pool";
import { randomUUID } from "crypto";

const handouts = [
  {
    title: "Understanding Eczema (Atopic Dermatitis)",
    category: "Skin Conditions",
    condition: "Atopic Dermatitis / Eczema",
    content: `What is Eczema?

Eczema, also called atopic dermatitis, is a chronic skin condition that causes dry, itchy, and inflamed skin. It's very common, especially in children, though adults can develop it too.

Symptoms:
• Dry, sensitive skin
• Intense itching
• Red or brownish-gray patches
• Small, raised bumps that may leak fluid when scratched
• Thickened, cracked, or scaly skin

Common Triggers:
• Dry skin
• Irritants (soaps, detergents, shampoos)
• Stress
• Hot and sweaty conditions
• Allergens (pet dander, pollen, dust mites)

Treatment:
• Moisturize daily with thick creams or ointments
• Use gentle, fragrance-free cleansers
• Apply prescription creams or ointments as directed
• Take lukewarm (not hot) baths
• Identify and avoid triggers
• Consider wet wrap therapy for severe cases

When to Call Your Doctor:
• Severe itching preventing sleep
• Signs of infection (pus, yellow crusting, fever)
• No improvement after 2 weeks of treatment
• Eczema covering large areas of the body`,
  },
  {
    title: "Living with Psoriasis",
    category: "Skin Conditions",
    condition: "Psoriasis",
    content: `What is Psoriasis?

Psoriasis is an autoimmune condition that speeds up skin cell growth, causing scales and red patches that can be itchy and painful.

Types of Psoriasis:
• Plaque psoriasis (most common) - raised, red patches with silver scales
• Guttate psoriasis - small, dot-like lesions
• Inverse psoriasis - smooth, red lesions in skin folds
• Pustular psoriasis - white pustules surrounded by red skin
• Erythrodermic psoriasis - widespread redness and shedding

Common Triggers:
• Stress
• Infections (strep throat, skin infections)
• Injury to skin (cuts, scrapes, bug bites)
• Cold, dry weather
• Certain medications
• Alcohol and smoking

Treatment Options:
• Topical treatments (creams, ointments)
• Light therapy (phototherapy)
• Oral or injected medications for moderate to severe cases
• Biologics for severe psoriasis

Self-Care Tips:
• Keep skin moisturized
• Take daily baths with lukewarm water
• Use gentle skin care products
• Avoid triggers when possible
• Manage stress
• Get regular sunlight (in moderation)

Remember: Psoriasis is not contagious. It's a chronic condition that can be managed effectively with proper treatment.`,
  },
  {
    title: "Acne Treatment Guide",
    category: "Skin Conditions",
    condition: "Acne Vulgaris",
    content: `Understanding Acne

Acne occurs when hair follicles become clogged with oil and dead skin cells, leading to pimples, blackheads, and whiteheads.

Types of Acne:
• Blackheads - open clogged pores
• Whiteheads - closed clogged pores
• Papules - small red, tender bumps
• Pustules - pimples with pus at the tips
• Nodules - large, painful lumps beneath the skin
• Cystic lesions - painful, pus-filled lumps beneath the skin

Treatment Approach:
1. Cleanse gently twice daily
2. Use non-comedogenic products
3. Apply topical medications as prescribed
4. Don't pick or squeeze pimples
5. Be patient - treatments take 4-8 weeks to show results

Common Medications:
• Benzoyl peroxide - kills bacteria
• Salicylic acid - unclogs pores
• Retinoids - prevent clogged pores
• Antibiotics - reduce bacteria and inflammation
• Oral contraceptives (for women)
• Isotretinoin for severe acne

Do's and Don'ts:
✓ DO wash your face after sweating
✓ DO use oil-free makeup and sunscreen
✓ DO change pillowcases regularly
✗ DON'T scrub your face harshly
✗ DON'T pop or pick pimples
✗ DON'T use too many products at once

When to See Your Doctor:
• Over-the-counter treatments aren't working
• Acne is causing scarring
• Acne is affecting your self-esteem
• Sudden severe acne breakout`,
  },
  {
    title: "Rosacea Management",
    category: "Skin Conditions",
    condition: "Rosacea",
    content: `What is Rosacea?

Rosacea is a chronic skin condition causing redness and visible blood vessels on your face. It may also produce small, red, pus-filled bumps.

Symptoms:
• Facial redness (especially nose and cheeks)
• Swollen red bumps
• Eye problems (dry, irritated, swollen eyes)
• Enlarged nose (in severe cases)
• Visible blood vessels

Common Triggers:
• Hot beverages and spicy foods
• Alcohol
• Temperature extremes
• Sun and wind
• Emotions and stress
• Exercise
• Cosmetics
• Certain medications

Treatment:
• Topical medications (metronidazole, azelaic acid)
• Oral antibiotics for moderate to severe rosacea
• Laser therapy for visible blood vessels
• Eye treatments if needed

Skincare Tips:
• Use gentle, fragrance-free cleansers
• Apply broad-spectrum sunscreen daily (SPF 30+)
• Avoid products with alcohol, menthol, or witch hazel
• Use lukewarm water for washing
• Pat skin dry - don't rub
• Keep a trigger diary

Makeup Tips:
• Use green-tinted primers to neutralize redness
• Choose mineral-based makeup
• Avoid waterproof products
• Remove makeup gently each night`,
  },
  {
    title: "Melanoma Prevention and Early Detection",
    category: "Prevention",
    condition: "Skin Cancer Screening",
    content: `Skin Cancer Prevention

Melanoma is the most serious type of skin cancer. Early detection is critical for successful treatment.

ABCDE Warning Signs:
A - Asymmetry: One half doesn't match the other
B - Border: Edges are irregular, ragged, or blurred
C - Color: Color is not uniform; may include shades of brown, black, pink, red, white, or blue
D - Diameter: Spot is larger than 6mm (size of a pencil eraser)
E - Evolving: The mole is changing in size, shape, or color

Risk Factors:
• Fair skin, light hair, light eyes
• History of sunburns
• Excessive UV exposure
• Many moles or unusual moles
• Family history of melanoma
• Weakened immune system
• Age over 50

Prevention:
• Seek shade during peak sun hours (10am-4pm)
• Wear protective clothing (wide-brimmed hats, long sleeves)
• Use broad-spectrum sunscreen (SPF 30+)
• Reapply sunscreen every 2 hours
• Avoid tanning beds
• Perform monthly self-exams
• Get annual professional skin checks

Self-Examination:
1. Examine your body in a full-length mirror
2. Check all areas including scalp, palms, soles
3. Use a hand mirror for hard-to-see areas
4. Take photos to track changes
5. Report any new or changing spots to your doctor

When to See Your Doctor Immediately:
• New mole that looks different from others
• Mole that changes in size, shape, or color
• Mole that bleeds or doesn't heal
• Spot that becomes painful or itchy`,
  },
  {
    title: "After Your Skin Biopsy",
    category: "Post-Procedure Care",
    condition: "Skin Biopsy Care",
    content: `Post-Biopsy Care Instructions

Proper care after your skin biopsy helps ensure optimal healing and minimal scarring.

Immediate Care (First 24 Hours):
• Leave the bandage on for 24 hours
• Keep the area dry (no showers)
• Elevate the area if possible to reduce swelling
• Apply ice packs (wrapped in cloth) for 15-20 minutes if needed
• Take over-the-counter pain medication if needed

Daily Care (After First 24 Hours):
1. Remove the bandage
2. Wash gently with soap and water
3. Pat dry with clean towel
4. Apply antibiotic ointment (unless instructed otherwise)
5. Cover with a new bandage
6. Repeat daily until healed (usually 1-2 weeks)

Normal vs. Concerning Signs:

Normal:
✓ Mild pain or discomfort
✓ Slight redness around the site
✓ Small amount of clear or pink drainage
✓ Mild swelling
✓ Scab formation

Call Your Doctor If You Notice:
✗ Increasing pain after 48 hours
✗ Spreading redness
✗ Pus or yellow drainage
✗ Fever over 100.4°F
✗ Bleeding that doesn't stop with pressure
✗ Separation of wound edges

Activity Restrictions:
• Avoid strenuous exercise for 48 hours
• No swimming or soaking for 1 week
• Protect from sun exposure
• Avoid picking at scabs

Scarring:
• Some scarring is normal
• Scars fade over 6-12 months
• Keep the area moisturized
• Use sunscreen to prevent darkening
• Ask about scar treatments if concerned

Results:
• Biopsy results typically available in 7-10 days
• We will contact you with results
• Schedule follow-up appointment as directed`,
  },
  {
    title: "Mohs Surgery: What to Expect",
    category: "Procedures",
    condition: "Mohs Micrographic Surgery",
    content: `Understanding Mohs Surgery

Mohs surgery is a precise technique for removing skin cancer while preserving as much healthy tissue as possible.

What is Mohs Surgery?
A specialized procedure where skin cancer is removed in stages, with immediate microscopic examination until all cancer cells are gone. It has the highest cure rate (up to 99%) for certain skin cancers.

Before Your Procedure:
• Continue all regular medications unless instructed otherwise
• Avoid blood thinners if possible (check with doctor)
• Eat a light breakfast
• Wear comfortable clothing
• Arrange for transportation home
• Bring something to do (book, tablet) - the procedure can take several hours

What to Expect:
1. Local anesthetic injection (you'll be awake)
2. First layer of tissue removed
3. Tissue examined under microscope (30-60 minutes)
4. If cancer cells remain, another layer is removed
5. Process repeats until clear margins achieved
6. Wound is reconstructed

After the Procedure:
• You'll have a pressure bandage
• Keep area elevated for 48 hours
• Apply ice packs to reduce swelling
• Take pain medication as prescribed
• Rest and limit activity for a few days

Wound Care:
• Keep bandage dry for 24-48 hours
• Clean daily with hydrogen peroxide after 48 hours
• Apply antibiotic ointment
• Cover with bandage
• Watch for signs of infection

Recovery Timeline:
• Stitches removed in 7-14 days
• Bruising peaks at 2-3 days
• Swelling gradually improves over 1-2 weeks
• Full healing takes 4-6 weeks
• Scar continues to fade for 1-2 years

When to Call:
• Excessive bleeding
• Increasing pain
• Signs of infection (pus, fever, increasing redness)
• Wound separation
• Severe swelling`,
  },
  {
    title: "Botox and Filler Aftercare",
    category: "Post-Procedure Care",
    condition: "Cosmetic Injection Aftercare",
    content: `After Your Cosmetic Injection Treatment

Following these instructions helps ensure optimal results and minimizes side effects.

Immediately After Treatment:

For the First 24 Hours - DO:
✓ Apply ice packs for 10 minutes every hour
✓ Keep head elevated (sleep on extra pillows)
✓ Take acetaminophen (Tylenol) for discomfort
✓ Be gentle when cleansing face
✓ Stay hydrated

For the First 24 Hours - DON'T:
✗ Touch or massage the treated areas
✗ Lie down for 4 hours after Botox
✗ Exercise or heavy lifting
✗ Consume alcohol
✗ Take blood thinners (aspirin, ibuprofen)
✗ Apply makeup for 4 hours
✗ Undergo dental work or facial treatments

For the First Week:
• Avoid intense heat (saunas, hot yoga)
• No facials or chemical peels
• Limit sun exposure
• Sleep on your back
• Avoid blood thinners
• No dental work

Normal Side Effects:
• Mild swelling (peaks at 48 hours)
• Bruising (may last 1-2 weeks)
• Redness at injection sites
• Tenderness
• Small bumps (resolve within hours to days)

When to Call Your Doctor:
• Vision changes
• Severe or increasing pain
• Asymmetry persisting beyond 2 weeks
• Signs of infection
• Allergic reaction symptoms
• Difficulty swallowing or breathing

Results Timeline:

Botox:
• Effects begin in 3-5 days
• Full results at 2 weeks
• Lasts 3-4 months

Fillers:
• Immediate improvement
• Final results after swelling resolves (2 weeks)
• Lasts 6-18 months depending on type

Maintenance:
• Botox: treatments every 3-4 months
• Fillers: touch-ups as needed
• Regular appointments help maintain results
• Good skincare extends results`,
  },
  {
    title: "Poison Ivy, Oak, and Sumac",
    category: "Skin Conditions",
    condition: "Contact Dermatitis - Poison Plants",
    content: `Poison Ivy, Oak, and Sumac Reactions

These plants contain urushiol, an oil that causes an allergic skin reaction in most people.

Symptoms:
• Red, itchy rash
• Streaky or patchy appearance
• Bumps and blisters
• Swelling
• Appears 12-72 hours after contact

Important Facts:
• The rash itself is NOT contagious
• Only the plant oil (urushiol) causes the rash
• Oil can remain on clothing, tools, and pet fur
• Burning poison ivy releases oil into the air - never burn!

Immediate First Aid (Within 30 Minutes):
1. Rinse skin with rubbing alcohol
2. Wash with soap and cool water
3. Clean under fingernails
4. Wash all clothing and items that contacted the plant

Treatment at Home:
• Cool compresses or oatmeal baths
• Calamine lotion for itching
• Oral antihistamines (Benadryl)
• Keep affected area clean and dry
• Short, lukewarm baths
• Pat dry - don't rub

Prescription Treatment:
• Topical corticosteroids for mild cases
• Oral steroids for severe or widespread rash
• Antibiotic ointment if infection develops

When to See a Doctor:
• Rash on face, eyes, mouth, or genitals
• Rash covers large area of body
• Severe swelling
• Difficulty breathing
• Fever over 100°F
• Rash doesn't improve in a week
• Signs of infection (pus, yellow crusting)

Prevention:
• Learn to identify the plants
• Wear protective clothing in wooded areas
• Wash skin immediately if exposed
• Clean tools and equipment
• Wash pet fur if they've been in affected areas

Plant Identification:
Poison Ivy: "Leaves of three, let it be"
• Three leaflets per leaf
• Grows as vine or shrub
• Leaflets may be smooth or toothed

Poison Oak:
• Three leaflets (oak-like shape)
• Grows as shrub

Poison Sumac:
• 7-13 leaflets per stem
• Grows as shrub or small tree
• Found in wet, swampy areas`,
  },
  {
    title: "Managing Hives (Urticaria)",
    category: "Skin Conditions",
    condition: "Urticaria / Hives",
    content: `Understanding Hives

Hives are raised, itchy welts on the skin that can appear suddenly and disappear within hours.

What Causes Hives?
• Allergic reactions (foods, medications, insect stings)
• Physical triggers (pressure, temperature, sun, exercise)
• Infections
• Stress
• Unknown (in many cases)

Types:
Acute Hives: Last less than 6 weeks
Chronic Hives: Last more than 6 weeks

Symptoms:
• Red or skin-colored welts
• Intense itching
• Welts that change shape and location
• Swelling (angioedema) may occur with hives

Emergency Warning Signs (Seek Immediate Care):
• Difficulty breathing or swallowing
• Swelling of tongue or throat
• Dizziness or fainting
• Chest tightness
• These may indicate anaphylaxis - call 911

Home Treatment:
• Take antihistamines (as directed)
• Apply cool compresses
• Wear loose, light clothing
• Avoid hot showers
• Identify and avoid triggers
• Keep a symptom diary

Medications:
• Non-sedating antihistamines (Claritin, Zyrtec, Allegra)
• H2 blockers for stubborn cases
• Oral steroids for severe episodes
• Epinephrine auto-injector if at risk for anaphylaxis

Trigger Avoidance:
• Keep food diary if food allergies suspected
• Note medication timing
• Track environmental exposures
• Document physical activities before outbreaks

When to See Your Doctor:
• Hives lasting more than a few days
• Severe or frequent episodes
• Hives don't respond to antihistamines
• Accompanied by joint pain or fever
• Affecting daily activities or sleep`,
  },
  {
    title: "Wart Treatment Options",
    category: "Skin Conditions",
    condition: "Verruca / Warts",
    content: `Understanding Warts

Warts are benign skin growths caused by human papillomavirus (HPV). They're common and usually harmless.

Types of Warts:
• Common warts - rough, raised, on hands and fingers
• Plantar warts - flat, on soles of feet, may be painful
• Flat warts - smooth, flat, on face and forehead
• Filiform warts - thread-like, on face around mouth/nose
• Periungual warts - around or under nails

Are Warts Contagious?
Yes, warts can spread:
• From person to person
• To other parts of your own body
• Through breaks in the skin
• In warm, moist environments (pools, locker rooms)

Treatment Options:

Over-the-Counter:
• Salicylic acid (17-40%)
• Apply daily after soaking and filing
• Takes 3-6 months
• Best for common warts

In-Office Treatments:
• Cryotherapy (freezing with liquid nitrogen)
• Usually requires multiple treatments
• Can be painful but effective

• Cantharidin (blister beetle extract)
• Painted on wart, causes blister
• Return visit to remove dead tissue

• Prescription medications
• Stronger acids or immune modulators

• Laser therapy or surgery for stubborn warts

Home Treatment Steps:
1. Soak wart in warm water for 10-15 minutes
2. File gently with pumice stone or emery board
3. Apply salicylic acid
4. Cover with bandage
5. Repeat daily
6. Be patient - can take months

Prevention:
• Wash hands regularly
• Don't pick at warts
• Keep feet dry and clean
• Wear flip-flops in public showers
• Don't share towels or personal items
• Cover cuts and scrapes
• Keep immune system healthy

When to See a Doctor:
• Wart on face or genitals
• Painful warts
• Many warts appearing suddenly
• Warts that bleed, change color, or don't respond to treatment
• Warts in someone with diabetes or weakened immune system
• Uncertain if growth is a wart

Note: Many warts disappear on their own within 2 years, especially in children. Treatment speeds this process.`,
  },
];

async function seedHandouts() {
  console.log("Starting handout seeding...");

  // Get the demo tenant ID
  const tenantResult = await pool.query("SELECT id FROM tenants LIMIT 1");
  if (tenantResult.rows.length === 0) {
    console.error("No tenant found. Please run the main seed script first.");
    return;
  }

  const tenantId = tenantResult.rows[0].id;
  console.log(`Using tenant: ${tenantId}`);

  // Get a user ID for created_by
  const userResult = await pool.query(
    "SELECT id FROM users WHERE tenant_id = $1 LIMIT 1",
    [tenantId]
  );
  const createdBy = userResult.rows[0]?.id;

  let inserted = 0;
  for (const handout of handouts) {
    try {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO patient_handouts (
          id, tenant_id, title, category, condition, content, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          tenantId,
          handout.title,
          handout.category,
          handout.condition,
          handout.content,
          true,
          createdBy,
        ]
      );
      inserted++;
      console.log(`✓ ${handout.title}`);
    } catch (err: any) {
      console.error(`Failed to insert ${handout.title}:`, err.message);
    }
  }

  console.log(`\nHandout seeding complete: ${inserted}/${handouts.length} handouts created`);
}

seedHandouts()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
